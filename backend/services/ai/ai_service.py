from __future__ import annotations

import json
import logging
import re
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
from threading import Event, Lock, Semaphore
from typing import Any, Callable, Iterable

import requests

from config import settings
from services.ai.model_router import RouterModels, detect_task_type, select_best_model
from services.ai.prompt_builder import build_system_prompt
from utils.token_estimate import estimate_total_request_tokens, log_usage_vs_estimate


# Free OpenRouter models queue deeply; use a longer read timeout when that tier is active.
_FREE_MODEL_TIMEOUT_SECONDS = 360


def _free_model_fallbacks() -> tuple[str, ...]:
    """Free-tier OpenRouter models used after HTTP 402 / budget exhaustion.

    - Set ``OPENROUTER_FREE_FALLBACKS`` to a comma-separated list to override.
    - Set to ``none`` to disable all free-tier fallbacks (paid keys only).
    - When unset / empty and an OpenRouter API key is configured, defaults to
      ``openrouter/free`` (OpenRouter's free-model router) so agent runs can finish
      without a topped-up wallet when direct Groq/Gemini keys are not set.
    """
    raw = (getattr(settings, "openrouter_free_fallbacks", "") or "").strip()
    if raw.lower() in ("none", "false", "0"):
        return ()
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if parts:
        return tuple(parts)
    or_key = (getattr(settings, "openrouter_api_key", "") or "").strip()
    if or_key:
        return ("openrouter/free",)
    return ()


def _is_free_model(model: str) -> bool:
    return ":free" in (model or "") or (model or "").startswith("openrouter/")


logger = logging.getLogger(__name__)


class AIServiceError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class AIResult:
    text: str
    model_used: str
    latency_ms: int
    usage: dict[str, Any]
    retries: int


@dataclass(frozen=True)
class _ProviderAttempt:
    provider_id: str
    model_label: str
    runner: Callable[[], AIResult]


class AIService:
    def __init__(self) -> None:
        self.base_url = (getattr(settings, "openrouter_base_url", "") or "https://openrouter.ai/api/v1").rstrip("/")
        self.timeout_seconds = max(1, int(getattr(settings, "openrouter_timeout_seconds", 45)))
        self.max_tokens = max(1, min(int(getattr(settings, "openrouter_max_tokens", 8192)), 32768))
        self.retry_count = max(0, int(getattr(settings, "openrouter_retry_count", 2)))
        self.cache_ttl_seconds = max(0, int(getattr(settings, "openrouter_cache_ttl_seconds", 60)))
        self.models = RouterModels(
            fast_model=getattr(settings, "openrouter_fast_model", "openai/gpt-4o-mini"),
            smart_model=getattr(settings, "openrouter_smart_model", "anthropic/claude-sonnet-4"),
            vision_model=getattr(settings, "openrouter_vision_model", "openai/gpt-4o"),
            image_model=getattr(settings, "openrouter_image_model", "openai/gpt-image-1"),
            default_model=getattr(settings, "openrouter_model", "openai/gpt-5-mini"),
        )
        self._cache: dict[str, tuple[float, AIResult]] = {}
        self._cache_lock = Lock()
        self._gate = Semaphore(max(1, int(getattr(settings, "openrouter_concurrency_limit", 6))))

    def _headers(self) -> dict[str, str]:
        key = settings.openrouter_api_key.strip()
        if not key:
            raise AIServiceError("OPENROUTER_API_KEY is not configured")
        return {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": getattr(settings, "public_app_origin", "") or "https://flowpilot.local",
            "X-Title": "FlowPilot",
        }

    def _cache_key(self, *, model: str, prompt: str, task_type: str) -> str:
        return f"{model}|{task_type}|{hash(prompt)}"

    def _read_cache(self, key: str) -> AIResult | None:
        if self.cache_ttl_seconds <= 0:
            return None
        with self._cache_lock:
            row = self._cache.get(key)
            if not row:
                return None
            expires_at, result = row
            if expires_at <= time.time():
                self._cache.pop(key, None)
                return None
            return result

    def _write_cache(self, key: str, result: AIResult) -> None:
        if self.cache_ttl_seconds <= 0:
            return
        with self._cache_lock:
            self._cache[key] = (time.time() + self.cache_ttl_seconds, result)

    @staticmethod
    def _strip_json_fences(raw: str) -> str:
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*```\s*$", "", text)
        return text.strip()

    def _validate_response_text(
        self,
        text: str,
        *,
        response_format: dict[str, Any] | None,
    ) -> bool:
        """Reject empty or structurally invalid AI output before declaring a race winner."""
        cleaned = text.strip()
        if not cleaned:
            return False
        if not isinstance(response_format, dict) or response_format.get("type") != "json_object":
            return True
        try:
            payload = json.loads(self._strip_json_fences(cleaned))
        except json.JSONDecodeError:
            return False
        if not isinstance(payload, dict) or not payload:
            return False

        content_html = str(payload.get("contentHtml") or "").strip()
        title = str(payload.get("title") or "").strip()

        if set(payload.keys()) <= {"contentHtml"}:
            return len(content_html) > 20
        if title:
            return True
        return False

    def _race_providers(
        self,
        *,
        attempts: list[_ProviderAttempt],
        routed_task: str,
        response_format: dict[str, Any] | None,
    ) -> AIResult:
        """Run eligible providers concurrently; first valid response wins, others are ignored."""
        if not attempts:
            raise AIServiceError("No AI providers are configured")

        if len(attempts) == 1:
            only = attempts[0]
            started = time.time()
            logger.info("AI provider start provider=%s task=%s (single provider)", only.provider_id, routed_task)
            try:
                result = only.runner()
            except AIServiceError as exc:
                duration_ms = int((time.time() - started) * 1000)
                logger.warning(
                    "AI provider failed provider=%s task=%s duration_ms=%s reason=%s",
                    only.provider_id,
                    routed_task,
                    duration_ms,
                    str(exc)[:300],
                )
                raise
            duration_ms = int((time.time() - started) * 1000)
            if not self._validate_response_text(result.text, response_format=response_format):
                raise AIServiceError(f"Provider {only.provider_id} returned an invalid response")
            logger.info(
                "AI provider winner provider=%s model=%s task=%s duration_ms=%s latency_ms=%s",
                only.provider_id,
                result.model_used,
                routed_task,
                duration_ms,
                result.latency_ms,
            )
            return result

        settled = Event()
        winner_lock = Lock()
        winner: AIResult | None = None
        winner_provider: str | None = None
        failures: list[str] = []

        def _run_attempt(attempt: _ProviderAttempt) -> AIResult | None:
            if settled.is_set():
                return None
            started = time.time()
            logger.info(
                "AI provider race start provider=%s model=%s task=%s",
                attempt.provider_id,
                attempt.model_label,
                routed_task,
            )
            try:
                result = attempt.runner()
            except AIServiceError as exc:
                duration_ms = int((time.time() - started) * 1000)
                reason = str(exc)[:300]
                with winner_lock:
                    failures.append(f"{attempt.provider_id}: {reason}")
                logger.warning(
                    "AI provider race failed provider=%s model=%s task=%s duration_ms=%s reason=%s",
                    attempt.provider_id,
                    attempt.model_label,
                    routed_task,
                    duration_ms,
                    reason,
                )
                return None

            duration_ms = int((time.time() - started) * 1000)
            if settled.is_set():
                logger.info(
                    "AI provider race ignored (late) provider=%s model=%s task=%s duration_ms=%s",
                    attempt.provider_id,
                    attempt.model_label,
                    routed_task,
                    duration_ms,
                )
                return None

            if not self._validate_response_text(result.text, response_format=response_format):
                with winner_lock:
                    failures.append(f"{attempt.provider_id}: invalid response payload")
                logger.warning(
                    "AI provider race rejected provider=%s model=%s task=%s duration_ms=%s reason=invalid payload",
                    attempt.provider_id,
                    attempt.model_label,
                    routed_task,
                    duration_ms,
                )
                return None

            with winner_lock:
                if settled.is_set():
                    logger.info(
                        "AI provider race ignored (late valid) provider=%s model=%s task=%s duration_ms=%s",
                        attempt.provider_id,
                        attempt.model_label,
                        routed_task,
                        duration_ms,
                    )
                    return None
                nonlocal winner, winner_provider
                winner = result
                winner_provider = attempt.provider_id
                settled.set()
            logger.info(
                "AI provider race winner provider=%s model=%s task=%s duration_ms=%s latency_ms=%s",
                attempt.provider_id,
                result.model_used,
                routed_task,
                duration_ms,
                result.latency_ms,
            )
            return result

        race_started = time.time()
        max_workers = max(1, min(len(attempts), int(getattr(settings, "openrouter_concurrency_limit", 6))))
        executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="ai-race")
        pending: set[Future[AIResult | None]] = set()
        try:
            for attempt in attempts:
                pending.add(executor.submit(_run_attempt, attempt))

            while pending and not settled.is_set():
                done, pending = wait(pending, return_when=FIRST_COMPLETED)
                for future in done:
                    try:
                        if future.result() is not None and settled.is_set():
                            break
                    except Exception as exc:  # pragma: no cover - defensive
                        with winner_lock:
                            failures.append(f"unexpected: {exc}")
        finally:
            # Do not block on slower providers once a winner is selected.
            executor.shutdown(wait=not settled.is_set(), cancel_futures=True)

        if winner is not None:
            race_ms = int((time.time() - race_started) * 1000)
            logger.info(
                "AI provider race settled winner=%s model=%s task=%s race_ms=%s failures=%s",
                winner_provider,
                winner.model_used,
                routed_task,
                race_ms,
                len(failures),
            )
            return winner

        summary = "; ".join(failures[:6]) if failures else "no providers returned valid output"
        raise AIServiceError(f"All parallel AI providers failed. {summary}")

    def _build_parallel_provider_attempts(
        self,
        *,
        prompt: str,
        routed_task: str,
        model: str,
        max_tokens: int | None,
        temperature: float,
        response_format: dict[str, Any] | None,
        prefer_groq_first: bool,
        prefer_gemini: bool,
    ) -> list[_ProviderAttempt]:
        """Collect every configured provider for a concurrent race (Groq, Gemini, OpenRouter paid/free)."""
        attempts: list[_ProviderAttempt] = []

        if prefer_groq_first and (getattr(settings, "groq_api_key", "") or "").strip():
            groq_label = "groq/" + (getattr(settings, "groq_model", "") or "llama-3.3-70b-versatile").strip()

            def _groq_runner() -> AIResult:
                started = time.time()
                with self._gate:
                    groq_result = self._call_groq(
                        task_type=routed_task,
                        prompt=prompt,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        response_format=response_format,
                    )
                latency = int((time.time() - started) * 1000)
                text = groq_result.get("text", "").strip()
                if not text:
                    raise AIServiceError("Groq returned empty content")
                return AIResult(
                    text=text,
                    model_used=groq_label,
                    latency_ms=latency,
                    usage=groq_result.get("usage", {}),
                    retries=0,
                )

            attempts.append(_ProviderAttempt("groq", groq_label, _groq_runner))

        if prefer_gemini and (getattr(settings, "google_ai_api_key", "") or "").strip():
            gemini_label = f"google/{(getattr(settings, 'gemini_model', '') or 'gemini-2.0-flash').strip()}"

            def _gemini_runner() -> AIResult:
                started = time.time()
                with self._gate:
                    gemini_result = self._call_gemini(
                        prompt=prompt,
                        task_type=routed_task,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        response_format=response_format,
                    )
                latency = int((time.time() - started) * 1000)
                text = gemini_result.get("text", "").strip()
                if not text:
                    raise AIServiceError("Gemini returned empty content")
                return AIResult(
                    text=text,
                    model_used=gemini_label,
                    latency_ms=latency,
                    usage=gemini_result.get("usage", {}),
                    retries=0,
                )

            attempts.append(_ProviderAttempt("gemini", gemini_label, _gemini_runner))

        if (getattr(settings, "openrouter_api_key", "") or "").strip():
            paid_model = model

            def _openrouter_paid_runner(paid: str = paid_model) -> AIResult:
                started = time.time()
                with self._gate:
                    paid_result = self._call_chat(
                        model=paid,
                        task_type=routed_task,
                        prompt=prompt,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        response_format=response_format,
                    )
                latency = int((time.time() - started) * 1000)
                text = paid_result.get("text", "").strip()
                if not text:
                    raise AIServiceError("OpenRouter returned empty content")
                return AIResult(
                    text=text,
                    model_used=paid,
                    latency_ms=latency,
                    usage=paid_result.get("usage", {}),
                    retries=0,
                )

            attempts.append(_ProviderAttempt("openrouter_paid", paid_model, _openrouter_paid_runner))

            for free_model in _free_model_fallbacks():
                def _openrouter_free_runner(free: str = free_model) -> AIResult:
                    started = time.time()
                    with self._gate:
                        free_result = self._call_chat(
                            model=free,
                            task_type=routed_task,
                            prompt=prompt,
                            max_tokens=max_tokens,
                            temperature=temperature,
                            response_format=response_format,
                            timeout_override=_FREE_MODEL_TIMEOUT_SECONDS,
                        )
                    latency = int((time.time() - started) * 1000)
                    text = free_result.get("text", "").strip()
                    if not text:
                        raise AIServiceError("OpenRouter free tier returned empty content")
                    return AIResult(
                        text=text,
                        model_used=free,
                        latency_ms=latency,
                        usage=free_result.get("usage", {}),
                        retries=0,
                    )

                attempts.append(
                    _ProviderAttempt(f"openrouter_free:{free_model}", free_model, _openrouter_free_runner)
                )

        return attempts

    def _call_gemini(
        self,
        *,
        prompt: str,
        task_type: str,
        max_tokens: int | None,
        temperature: float,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        key = (getattr(settings, "google_ai_api_key", "") or "").strip()
        if not key:
            raise AIServiceError("GOOGLE_AI_API_KEY is not configured", status_code=401)
        model = (getattr(settings, "gemini_model", "") or "gemini-2.0-flash").strip()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        system_prompt = build_system_prompt(task_type)
        generation_config: dict[str, Any] = {
            "temperature": temperature,
            "maxOutputTokens": min(max_tokens or self.max_tokens, 8192),
        }
        # Translate OpenAI-style JSON mode into Gemini's responseMimeType so
        # callers like the carousel agent get parseable JSON back from Gemini.
        if isinstance(response_format, dict) and response_format.get("type") == "json_object":
            generation_config["responseMimeType"] = "application/json"
        # Gemini uses a single user turn; prepend system instructions inline.
        payload: dict[str, Any] = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        }
        try:
            response = requests.post(
                url,
                headers={"Content-Type": "application/json", "X-goog-api-key": key},
                json=payload,
                timeout=self.timeout_seconds,
            )
        except requests.Timeout as exc:
            raise AIServiceError(f"Gemini timed out after {self.timeout_seconds}s", status_code=408) from exc
        except requests.RequestException as exc:
            detail = exc.response.text[:600] if getattr(exc, "response", None) is not None else str(exc)
            raise AIServiceError(f"Gemini request failed: {detail}") from exc

        raw = response.text or ""
        if response.status_code >= 400:
            raise AIServiceError(f"Gemini HTTP {response.status_code}: {raw[:600]}", status_code=response.status_code)
        try:
            data = response.json()
            text = str(data["candidates"][0]["content"]["parts"][0]["text"]).strip()
            meta = data.get("usageMetadata") or {}
            usage = {
                "prompt_tokens": meta.get("promptTokenCount", 0),
                "completion_tokens": meta.get("candidatesTokenCount", 0),
                "total_tokens": meta.get("totalTokenCount", 0),
            }
            return {"text": text, "usage": usage}
        except Exception as exc:
            raise AIServiceError("Gemini returned invalid response shape") from exc

    def _call_groq(
        self,
        *,
        task_type: str,
        prompt: str,
        max_tokens: int | None,
        temperature: float,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        key = (getattr(settings, "groq_api_key", "") or "").strip()
        if not key:
            raise AIServiceError("GROQ_API_KEY is not configured", status_code=401)
        base_raw = getattr(settings, "groq_base_url", "") or "https://api.groq.com/openai/v1"
        base = str(base_raw).rstrip("/")
        model_raw = getattr(settings, "groq_model", "") or "llama-3.3-70b-versatile"
        model = str(model_raw).strip() or "llama-3.3-70b-versatile"
        system_prompt = build_system_prompt(task_type)
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max(1, min(max_tokens or self.max_tokens, 32768)),
        }
        if response_format:
            payload["response_format"] = response_format
        try:
            response = requests.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
                timeout=self.timeout_seconds,
            )
        except requests.Timeout as exc:
            raise AIServiceError(f"Groq timed out after {self.timeout_seconds}s", status_code=408) from exc
        except requests.RequestException as exc:
            detail = exc.response.text[:600] if getattr(exc, "response", None) is not None else str(exc)
            raise AIServiceError(f"Groq request failed: {detail}") from exc

        raw = response.text or ""
        if response.status_code >= 400:
            raise AIServiceError(f"Groq HTTP {response.status_code}: {raw[:600]}", status_code=response.status_code)
        try:
            data = response.json()
            text = str(data["choices"][0]["message"]["content"]).strip()
            usage = data.get("usage") if isinstance(data, dict) else {}
            if not isinstance(usage, dict):
                usage = {}
            return {"text": text, "usage": usage}
        except Exception as exc:
            raise AIServiceError("Groq returned invalid response shape") from exc

    def gemini_request(
        self,
        *,
        prompt: str,
        task_type: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.7,
        response_format: dict[str, Any] | None = None,
    ) -> AIResult:
        """Call Gemini directly. Raises AIServiceError if key is missing or Gemini fails (no OpenRouter fallback)."""
        gemini_key = (getattr(settings, "google_ai_api_key", "") or "").strip()
        if not gemini_key:
            raise AIServiceError("GOOGLE_AI_API_KEY is not configured", status_code=401)
        routed_task = detect_task_type(prompt=prompt, explicit=task_type)
        gemini_started = time.time()
        with self._gate:
            gemini_result = self._call_gemini(
                prompt=prompt,
                task_type=routed_task,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format=response_format,
            )
        gemini_text = gemini_result.get("text", "").strip()
        if not gemini_text:
            raise AIServiceError("Gemini returned empty content")
        gemini_latency = int((time.time() - gemini_started) * 1000)
        gemini_model_name = f"google/{(getattr(settings, 'gemini_model', '') or 'gemini-2.0-flash').strip()}"
        logger.info(
            "AI success provider=gemini model=%s task=%s latency_ms=%s usage=%s",
            gemini_model_name,
            routed_task,
            gemini_latency,
            json.dumps(gemini_result.get("usage", {}), ensure_ascii=True),
        )
        return AIResult(
            text=gemini_text,
            model_used=gemini_model_name,
            latency_ms=gemini_latency,
            usage=gemini_result.get("usage", {}),
            retries=0,
        )

    def groq_only_request(
        self,
        *,
        prompt: str,
        task_type: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.7,
        response_format: dict[str, Any] | None = None,
    ) -> AIResult | None:
        """One Groq completion when GROQ_API_KEY is set; returns None so callers can try Gemini/OpenRouter."""
        key = (getattr(settings, "groq_api_key", "") or "").strip()
        if not key:
            return None
        routed_task = detect_task_type(prompt=prompt, explicit=task_type)
        started = time.time()
        try:
            with self._gate:
                groq_result = self._call_groq(
                    task_type=routed_task,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    response_format=response_format,
                )
            groq_text = groq_result.get("text", "").strip()
            if not groq_text:
                return None
            latency = int((time.time() - started) * 1000)
            label = "groq/" + (getattr(settings, "groq_model", "") or "llama-3.3-70b-versatile").strip()
            logger.info(
                "AI success provider=groq (preflight-only) model=%s task=%s latency_ms=%s",
                label,
                routed_task,
                latency,
            )
            return AIResult(
                text=groq_text,
                model_used=label,
                latency_ms=latency,
                usage=groq_result.get("usage", {}),
                retries=0,
            )
        except AIServiceError as exc:
            logger.warning("Groq-only preflight failed (status=%s): %s", exc.status_code, str(exc)[:300])
            return None

    def retry_request(
        self,
        *,
        prompt: str,
        preferred_model: str | None = None,
        task_type: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.7,
        response_format: dict[str, Any] | None = None,
        prefer_groq_first: bool = True,
        prefer_gemini: bool = True,
    ) -> AIResult:
        routed_task = detect_task_type(prompt=prompt, explicit=task_type)
        model = (preferred_model or "").strip() or select_best_model(routed_task, self.models)

        cache_key = self._cache_key(model=model, prompt=prompt, task_type=routed_task)
        cached = self._read_cache(cache_key)
        if cached:
            return cached

        # Concurrent provider race: Groq, Gemini, OpenRouter paid, and OpenRouter free
        # are launched together; the first valid response wins (no sequential wait on 429/402).
        attempts = self._build_parallel_provider_attempts(
            prompt=prompt,
            routed_task=routed_task,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            response_format=response_format,
            prefer_groq_first=prefer_groq_first,
            prefer_gemini=prefer_gemini,
        )
        token_estimate = estimate_total_request_tokens(
            system_prompt=build_system_prompt(routed_task),
            user_prompt=prompt,
            max_tokens=max_tokens or self.max_tokens,
            provider_count=len(attempts),
        )
        logger.info(
            "AI provider race start task=%s providers=%s prompt_tokens_est=%s completion_cap=%s "
            "total_per_provider_est=%s total_race_est=%s prompt_chars=%s",
            routed_task,
            len(attempts),
            token_estimate["prompt_tokens_est"],
            token_estimate["completion_cap"],
            token_estimate["total_per_provider_est"],
            token_estimate["total_race_est"],
            len(prompt),
        )
        final = self._race_providers(
            attempts=attempts,
            routed_task=routed_task,
            response_format=response_format,
        )
        self._write_cache(cache_key, final)
        log_usage_vs_estimate(
            logger,
            label="AI token usage",
            estimate=token_estimate,
            usage=final.usage,
            model_used=final.model_used,
            latency_ms=final.latency_ms,
        )
        logger.info(
            "AI success model=%s task=%s latency_ms=%s retries=%s usage=%s",
            final.model_used,
            routed_task,
            final.latency_ms,
            final.retries,
            json.dumps(final.usage, ensure_ascii=True),
        )
        return final

    def _call_chat(
        self,
        *,
        model: str,
        task_type: str,
        prompt: str,
        max_tokens: int | None,
        temperature: float,
        response_format: dict[str, Any] | None,
        timeout_override: int | None = None,
    ) -> dict[str, Any]:
        effective_timeout = timeout_override if timeout_override is not None else self.timeout_seconds
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": build_system_prompt(task_type)},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max(1, min(max_tokens or self.max_tokens, 32768)),
        }
        if response_format:
            payload["response_format"] = response_format
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
                timeout=effective_timeout,
            )
        except requests.Timeout as exc:
            raise AIServiceError(f"OpenRouter timed out after {effective_timeout}s", status_code=408) from exc
        except requests.RequestException as exc:
            detail = exc.response.text[:600] if getattr(exc, "response", None) is not None else str(exc)
            raise AIServiceError(f"OpenRouter request failed: {detail}") from exc

        raw = response.text or ""
        if response.status_code >= 400:
            raise AIServiceError(f"OpenRouter HTTP {response.status_code}: {raw[:600]}", status_code=response.status_code)
        try:
            data = response.json()
            text = str(data["choices"][0]["message"]["content"]).strip()
            usage = data.get("usage") if isinstance(data, dict) else {}
            if not isinstance(usage, dict):
                usage = {}
            return {"text": text, "usage": usage}
        except Exception as exc:
            raise AIServiceError("OpenRouter returned invalid response shape") from exc

    def stream_chat(
        self,
        *,
        prompt: str,
        preferred_model: str | None = None,
        task_type: str | None = None,
    ) -> Iterable[str]:
        routed_task = detect_task_type(prompt=prompt, explicit=task_type)
        model = (preferred_model or "").strip() or select_best_model(routed_task, self.models)
        payload = {
            "model": model,
            "stream": True,
            "messages": [
                {"role": "system", "content": build_system_prompt(routed_task)},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": self.max_tokens,
        }
        with requests.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json=payload,
            timeout=self.timeout_seconds,
            stream=True,
        ) as response:
            if response.status_code >= 400:
                raise AIServiceError(f"Streaming failed HTTP {response.status_code}: {(response.text or '')[:400]}")
            for line in response.iter_lines(decode_unicode=True):
                if not line:
                    continue
                s = line.strip()
                if not s.startswith("data:"):
                    continue
                chunk = s[5:].strip()
                if chunk == "[DONE]":
                    break
                yield chunk


ai_service = AIService()
