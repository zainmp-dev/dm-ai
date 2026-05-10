from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from threading import Lock, Semaphore
from typing import Any, Iterable

import requests

from config import settings
from services.ai.model_router import RouterModels, detect_task_type, fallback_model, select_best_model
from services.ai.prompt_builder import build_system_prompt


# Minimum max_tokens we will fall back to when OpenRouter says we can't afford the requested budget.
_MIN_AFFORDABLE_MAX_TOKENS = 256
# Headroom subtracted from "can only afford N" so the request fits even after price-rounding.
_AFFORDABLE_HEADROOM_TOKENS = 64
# Below this, paid models are useless even with retries — switch to OpenRouter free models.
_PAID_BUDGET_FLOOR = 256
# Free models queue deeply and can take 3-5 minutes to respond; use a much longer read timeout.
_FREE_MODEL_TIMEOUT_SECONDS = 360
# Free models on OpenRouter (no credits needed). Verified to return non-empty `content` (some
# free models only emit reasoning, which would fail our empty-text check). Override with
# OPENROUTER_FREE_FALLBACKS env (comma-separated) when OpenRouter rotates availability.
_FREE_MODEL_FALLBACKS_DEFAULT: tuple[str, ...] = (
    "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free",
    "google/gemma-4-31b-it:free",
    "minimax/minimax-m2.5:free",
)


def _free_model_fallbacks() -> tuple[str, ...]:
    raw = (getattr(settings, "openrouter_free_fallbacks", "") or "").strip()
    if not raw:
        return _FREE_MODEL_FALLBACKS_DEFAULT
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return tuple(parts) or _FREE_MODEL_FALLBACKS_DEFAULT


def _parse_affordable_max_tokens(error_message: str) -> int | None:
    """OpenRouter 402 surfaces 'can only afford N' — extract N so we can retry within budget."""
    match = re.search(r"can only afford\s+(\d+)", error_message, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


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

    def retry_request(
        self,
        *,
        prompt: str,
        preferred_model: str | None = None,
        task_type: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.7,
        response_format: dict[str, Any] | None = None,
        prefer_gemini: bool = False,
    ) -> AIResult:
        routed_task = detect_task_type(prompt=prompt, explicit=task_type)
        model = (preferred_model or "").strip() or select_best_model(routed_task, self.models)

        # ── Gemini first (opt-in only) ─────────────────────────────────────────
        # Only used when prefer_gemini=True (e.g. strategy agent). All other agents
        # go straight to OpenRouter so credits are not burned by duplicate Gemini calls.
        if prefer_gemini:
            gemini_key = (getattr(settings, "google_ai_api_key", "") or "").strip()
            if gemini_key:
                gemini_started = time.time()
                try:
                    with self._gate:
                        gemini_result = self._call_gemini(
                            prompt=prompt,
                            task_type=routed_task,
                            max_tokens=max_tokens,
                            temperature=temperature,
                            response_format=response_format,
                        )
                    gemini_text = gemini_result.get("text", "").strip()
                    if gemini_text:
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
                except AIServiceError as exc:
                    logger.warning(
                        "Gemini failed (status=%s), falling back to OpenRouter: %s",
                        exc.status_code,
                        str(exc)[:300],
                    )
                    # Fall through to OpenRouter.
        retries = 0
        last_error: AIServiceError | None = None
        # Track effective max_tokens across retries so a 402 budget hint sticks for the next attempt.
        effective_max_tokens: int | None = max_tokens
        # Queue of free models we will try after paid models exhaust budget; populated lazily.
        free_models = _free_model_fallbacks()
        free_queue: list[str] = []
        tried_free: set[str] = set()
        # Allow extra attempts when we transition to the free chain so the budget exhaustion doesn't end the call.
        max_attempts = self.retry_count + 1 + len(free_models)

        for _ in range(max_attempts):
            cache_key = self._cache_key(model=model, prompt=prompt, task_type=routed_task)
            cached = self._read_cache(cache_key)
            if cached:
                return cached

            started = time.time()
            try:
                with self._gate:
                    result = self._call_chat(
                        model=model,
                        task_type=routed_task,
                        prompt=prompt,
                        max_tokens=effective_max_tokens,
                        temperature=temperature,
                        response_format=response_format,
                        timeout_override=_FREE_MODEL_TIMEOUT_SECONDS if _is_free_model(model) else None,
                    )
                latency = int((time.time() - started) * 1000)
                final = AIResult(
                    text=result.get("text", "").strip(),
                    model_used=model,
                    latency_ms=latency,
                    usage=result.get("usage", {}),
                    retries=retries,
                )
                if not final.text:
                    raise AIServiceError("OpenRouter returned empty content")
                self._write_cache(cache_key, final)
                logger.info(
                    "AI success model=%s task=%s latency_ms=%s retries=%s usage=%s",
                    model,
                    routed_task,
                    latency,
                    retries,
                    json.dumps(final.usage, ensure_ascii=True),
                )
                return final
            except AIServiceError as exc:
                last_error = exc
                retries += 1
                logger.warning("AI request failed model=%s task=%s retry=%s err=%s", model, routed_task, retries, exc)

                # On 402, two paths: (a) retry same model with reduced max_tokens if affordable budget is usable,
                # (b) otherwise switch to a free model so the user is not blocked by an empty wallet.
                if exc.status_code == 402:
                    affordable = _parse_affordable_max_tokens(str(exc))
                    if (
                        affordable is not None
                        and affordable >= _PAID_BUDGET_FLOOR
                        and not _is_free_model(model)
                    ):
                        capped = max(_MIN_AFFORDABLE_MAX_TOKENS, affordable - _AFFORDABLE_HEADROOM_TOKENS)
                        if effective_max_tokens is None or capped < effective_max_tokens:
                            logger.info(
                                "AI retrying model=%s with capped max_tokens=%s (affordable=%s)",
                                model,
                                capped,
                                affordable,
                            )
                            effective_max_tokens = capped
                            continue
                    # Budget too low (or already at floor) — switch to the free model chain.
                    if not free_queue:
                        free_queue = [m for m in free_models if m and m not in tried_free]
                    if free_queue:
                        next_free = free_queue.pop(0)
                        tried_free.add(next_free)
                        logger.info(
                            "AI switching to free model=%s after budget-exhausted paid model=%s",
                            next_free,
                            model,
                        )
                        model = next_free
                        # Free models support generous max_tokens; reset cap to default budget.
                        effective_max_tokens = max_tokens
                        continue

                # On non-402 failures, prefer the next free model if we've already started using them,
                # otherwise route through the standard paid fallback chain.
                if _is_free_model(model) and free_queue:
                    next_free = free_queue.pop(0)
                    tried_free.add(next_free)
                    logger.info("AI switching to next free model=%s (prev free model failed)", next_free)
                    model = next_free
                    continue
                model = fallback_model(routed_task, self.models, model)
                continue

        raise AIServiceError(f"All retry/fallback attempts exhausted. Last error: {last_error}")

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
