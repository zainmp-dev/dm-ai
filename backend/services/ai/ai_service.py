from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from threading import Lock, Semaphore
from typing import Any, Callable, Iterable

import requests

from config import settings
from services.ai.errors import (
    ClassifiedError,
    ErrorType,
    ProviderHealth,
    ProviderOutcome,
    classify_provider_error,
    public_failure_payload,
)
from services.ai.gemini_config import resolve_gemini_model
from services.ai.model_router import RouterModels, detect_task_type, select_best_model
from services.ai.prompt_builder import build_system_prompt
from services.ai.response_parse import extract_chat_completion_text, extract_gemini_text, log_invalid_payload
from utils.token_estimate import estimate_total_request_tokens, log_usage_vs_estimate


_FREE_MODEL_TIMEOUT_SECONDS = 360
_DEFAULT_FREE_MODELS = (
    "mistralai/mistral-small-24b-instruct-2501:free",
    "google/gemma-3-27b-it:free",
)


def _free_model_fallbacks() -> tuple[str, ...]:
    """Free-tier OpenRouter models used after paid OpenRouter is unavailable.

    - Set ``OPENROUTER_FREE_FALLBACKS`` to a comma-separated list to override.
    - Set to ``none`` to disable all free-tier fallbacks.
    - When unset, uses known chat-completion free models (not ``openrouter/free``,
      which often returns a non-chat payload).
    """
    raw = (getattr(settings, "openrouter_free_fallbacks", "") or "").strip()
    if raw.lower() in ("none", "false", "0"):
        return ()
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if parts:
        return tuple(parts)
    or_key = (getattr(settings, "openrouter_api_key", "") or "").strip()
    if or_key:
        return _DEFAULT_FREE_MODELS
    return ()


def _is_free_model(model: str) -> bool:
    return ":free" in (model or "") or (model or "").startswith("openrouter/")


logger = logging.getLogger(__name__)


class AIServiceError(RuntimeError):
    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        *,
        error_type: ErrorType | None = None,
        retryable: bool = False,
        provider: str | None = None,
        model: str | None = None,
        public_payload: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.error_type = error_type
        self.retryable = retryable
        self.provider = provider
        self.model = model
        self.public_payload = public_payload


def _raise_classified(classified: ClassifiedError) -> None:
    raise AIServiceError(
        classified.message,
        classified.status_code,
        error_type=classified.error_type,
        retryable=classified.retryable,
        provider=classified.provider,
        model=classified.model,
    )


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
            raise AIServiceError("OPENROUTER_API_KEY is not configured", error_type=ErrorType.AUTH_ERROR, provider="openrouter")
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
        cleaned = self._strip_json_fences(text)
        if not cleaned:
            return False
        if not isinstance(response_format, dict) or response_format.get("type") != "json_object":
            return True
        blob = cleaned
        if not blob.startswith("{"):
            start = blob.find("{")
            end = blob.rfind("}")
            if start >= 0 and end > start:
                blob = blob[start : end + 1]
        try:
            payload = json.loads(blob)
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

    def _log_generation_failed(self, classified: ClassifiedError) -> None:
        logger.error(
            "AI_GENERATION_FAILED provider=%s model=%s errorType=%s status=%s retryable=%s message=%s",
            classified.provider,
            classified.model,
            classified.error_type.value if classified.error_type else "UNKNOWN",
            classified.status_code,
            classified.retryable,
            (classified.message or "")[:400],
        )

    def _try_provider(
        self,
        attempt: _ProviderAttempt,
        *,
        response_format: dict[str, Any] | None,
        request_health: dict[str, ProviderHealth],
    ) -> AIResult:
        max_tries = 1 + max(0, min(self.retry_count, 2))
        last_error: AIServiceError | None = None
        for attempt_idx in range(max_tries):
            started = time.time()
            try:
                result = attempt.runner()
            except AIServiceError as exc:
                classified = classify_provider_error(
                    provider=exc.provider or attempt.provider_id,
                    status_code=exc.status_code,
                    message=str(exc),
                    model=exc.model or attempt.model_label,
                )
                if exc.error_type:
                    classified.error_type = exc.error_type
                    classified.retryable = exc.retryable
                self._log_generation_failed(classified)
                request_health[attempt.provider_id.split(":")[0]] = classified.health()
                last_error = AIServiceError(
                    classified.message,
                    classified.status_code,
                    error_type=classified.error_type,
                    retryable=classified.retryable,
                    provider=classified.provider,
                    model=classified.model,
                )
                if not classified.retryable:
                    raise last_error from exc
                if attempt_idx + 1 >= max_tries:
                    raise last_error from exc
                delay = 0.4 * (2**attempt_idx)
                logger.info(
                    "AI provider retry provider=%s model=%s wait_s=%.1f try=%s/%s",
                    attempt.provider_id,
                    attempt.model_label,
                    delay,
                    attempt_idx + 2,
                    max_tries,
                )
                time.sleep(delay)
                continue

            duration_ms = int((time.time() - started) * 1000)
            if not self._validate_response_text(result.text, response_format=response_format):
                log_invalid_payload(
                    provider=attempt.provider_id,
                    model=result.model_used,
                    raw=result.text,
                    parsed=None,
                )
                classified = ClassifiedError(
                    ErrorType.INVALID_RESPONSE,
                    False,
                    f"{attempt.provider_id}: invalid response payload",
                    attempt.provider_id,
                    attempt.model_label,
                    None,
                )
                self._log_generation_failed(classified)
                raise AIServiceError(
                    classified.message,
                    error_type=ErrorType.INVALID_RESPONSE,
                    retryable=False,
                    provider=attempt.provider_id,
                    model=attempt.model_label,
                )
            logger.info(
                "AI provider success provider=%s model=%s duration_ms=%s latency_ms=%s",
                attempt.provider_id,
                result.model_used,
                duration_ms,
                result.latency_ms,
            )
            return result

        if last_error:
            raise last_error
        raise AIServiceError(f"Provider {attempt.provider_id} failed", provider=attempt.provider_id)

    def _sequential_fallback(
        self,
        *,
        attempts: list[_ProviderAttempt],
        routed_task: str,
        response_format: dict[str, Any] | None,
        context: dict[str, Any] | None = None,
    ) -> AIResult:
        if not attempts:
            raise AIServiceError("No AI providers are configured", status_code=503)

        outcomes: list[ProviderOutcome] = []
        request_health: dict[str, ProviderHealth] = {}
        ctx = context or {}
        logger.info(
            "AI sequential fallback start task=%s providers=%s category=%s title=%s mode=%s",
            routed_task,
            [a.provider_id for a in attempts],
            ctx.get("category") or "",
            (ctx.get("title") or "")[:80],
            ctx.get("mode") or "",
        )

        for attempt in attempts:
            family = attempt.provider_id.split(":")[0]
            health = request_health.get(family)
            if health and health != ProviderHealth.AVAILABLE:
                logger.info("AI skip provider=%s health=%s (same request)", attempt.provider_id, health.value)
                continue
            try:
                return self._try_provider(attempt, response_format=response_format, request_health=request_health)
            except AIServiceError as exc:
                classified = classify_provider_error(
                    provider=exc.provider or attempt.provider_id,
                    status_code=exc.status_code,
                    message=str(exc),
                    model=exc.model or attempt.model_label,
                )
                if exc.error_type:
                    classified.error_type = exc.error_type
                    classified.retryable = exc.retryable
                outcomes.append(
                    ProviderOutcome(
                        provider=attempt.provider_id,
                        model=attempt.model_label,
                        error=classified,
                        status=classified.user_status,
                    )
                )
                continue

        payload = public_failure_payload(outcomes)
        raise AIServiceError(
            payload["message"],
            503,
            error_type=ErrorType.PROVIDER_ERROR,
            retryable=False,
            public_payload=payload,
        )

    def _build_provider_attempts(
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
        attempts: list[_ProviderAttempt] = []
        gemini_model = resolve_gemini_model()
        groq_model = (getattr(settings, "groq_model", "") or "llama-3.3-70b-versatile").strip()

        if prefer_groq_first and (getattr(settings, "groq_api_key", "") or "").strip():
            groq_label = "groq/" + groq_model

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
                    raise AIServiceError(
                        "Groq returned empty content",
                        error_type=ErrorType.INVALID_RESPONSE,
                        provider="groq",
                        model=groq_label,
                    )
                return AIResult(
                    text=text,
                    model_used=groq_label,
                    latency_ms=latency,
                    usage=groq_result.get("usage", {}),
                    retries=0,
                )

            attempts.append(_ProviderAttempt("groq", groq_label, _groq_runner))

        if prefer_gemini and (getattr(settings, "google_ai_api_key", "") or "").strip():
            gemini_label = f"google/{gemini_model}"

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
                    raise AIServiceError(
                        "Gemini returned empty content",
                        error_type=ErrorType.INVALID_RESPONSE,
                        provider="gemini",
                        model=gemini_label,
                    )
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
                    raise AIServiceError(
                        "OpenRouter returned empty content",
                        error_type=ErrorType.INVALID_RESPONSE,
                        provider="openrouter_paid",
                        model=paid,
                    )
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
                        raise AIServiceError(
                            "OpenRouter free tier returned empty content",
                            error_type=ErrorType.INVALID_RESPONSE,
                            provider="openrouter_free",
                            model=free,
                        )
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
            raise AIServiceError("GOOGLE_AI_API_KEY is not configured", status_code=401, error_type=ErrorType.AUTH_ERROR, provider="gemini")
        model = resolve_gemini_model()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        system_prompt = build_system_prompt(task_type)
        generation_config: dict[str, Any] = {
            "temperature": temperature,
            "maxOutputTokens": min(max_tokens or self.max_tokens, 8192),
        }
        if isinstance(response_format, dict) and response_format.get("type") == "json_object":
            generation_config["responseMimeType"] = "application/json"
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
            raise AIServiceError(
                f"Gemini timed out after {self.timeout_seconds}s",
                status_code=408,
                error_type=ErrorType.TIMEOUT,
                retryable=True,
                provider="gemini",
                model=model,
            ) from exc
        except requests.RequestException as exc:
            detail = exc.response.text[:600] if getattr(exc, "response", None) is not None else str(exc)
            classified = classify_provider_error(provider="gemini", status_code=None, body=detail, model=model)
            _raise_classified(classified)

        raw = response.text or ""
        if response.status_code >= 400:
            classified = classify_provider_error(provider="gemini", status_code=response.status_code, body=raw, model=model)
            _raise_classified(classified)
        try:
            data = response.json()
            text = extract_gemini_text(data)
            meta = data.get("usageMetadata") or {}
            usage = {
                "prompt_tokens": meta.get("promptTokenCount", 0),
                "completion_tokens": meta.get("candidatesTokenCount", 0),
                "total_tokens": meta.get("totalTokenCount", 0),
            }
            return {"text": text, "usage": usage}
        except Exception as exc:
            log_invalid_payload(provider="gemini", model=model, raw=raw)
            raise AIServiceError(
                "Gemini returned invalid response shape",
                error_type=ErrorType.INVALID_RESPONSE,
                provider="gemini",
                model=model,
            ) from exc

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
            raise AIServiceError("GROQ_API_KEY is not configured", status_code=401, error_type=ErrorType.AUTH_ERROR, provider="groq")
        base_raw = getattr(settings, "groq_base_url", "") or "https://api.groq.com/openai/v1"
        base = str(base_raw).rstrip("/")
        model = (getattr(settings, "groq_model", "") or "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"
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
            raise AIServiceError(
                f"Groq timed out after {self.timeout_seconds}s",
                status_code=408,
                error_type=ErrorType.TIMEOUT,
                retryable=True,
                provider="groq",
                model=model,
            ) from exc
        except requests.RequestException as exc:
            detail = exc.response.text[:600] if getattr(exc, "response", None) is not None else str(exc)
            classified = classify_provider_error(provider="groq", status_code=None, body=detail, model=model)
            _raise_classified(classified)

        raw = response.text or ""
        if response.status_code >= 400:
            classified = classify_provider_error(provider="groq", status_code=response.status_code, body=raw, model=model)
            _raise_classified(classified)
        data: Any = None
        try:
            data = response.json()
            text = extract_chat_completion_text(data, provider="groq")
            usage = data.get("usage") if isinstance(data, dict) else {}
            if not isinstance(usage, dict):
                usage = {}
            return {"text": text, "usage": usage}
        except Exception as exc:
            log_invalid_payload(provider="groq", model=model, raw=raw, parsed=data)
            raise AIServiceError(
                "Groq returned invalid response shape",
                error_type=ErrorType.INVALID_RESPONSE,
                provider="groq",
                model=model,
            ) from exc

    def gemini_request(
        self,
        *,
        prompt: str,
        task_type: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.7,
        response_format: dict[str, Any] | None = None,
    ) -> AIResult:
        gemini_key = (getattr(settings, "google_ai_api_key", "") or "").strip()
        if not gemini_key:
            raise AIServiceError("GOOGLE_AI_API_KEY is not configured", status_code=401, error_type=ErrorType.AUTH_ERROR, provider="gemini")
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
            raise AIServiceError("Gemini returned empty content", error_type=ErrorType.INVALID_RESPONSE, provider="gemini")
        gemini_latency = int((time.time() - gemini_started) * 1000)
        gemini_model_name = f"google/{resolve_gemini_model()}"
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
            classified = classify_provider_error(
                provider="groq",
                status_code=exc.status_code,
                message=str(exc),
                model=exc.model or "",
            )
            self._log_generation_failed(classified)
            return None

    def generate_text(
        self,
        *,
        prompt: str,
        system_prompt: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.7,
        category: str | None = None,
        title: str | None = None,
        mode: str | None = None,
        preferred_model: str | None = None,
        task_type: str | None = None,
        response_format: dict[str, Any] | None = None,
        prefer_groq_first: bool = True,
        prefer_gemini: bool = True,
    ) -> AIResult:
        """Normalized generation entry point. Same prompt/context is sent to every fallback provider."""
        routed_task = detect_task_type(prompt=prompt, explicit=task_type)
        user_prompt = prompt
        if system_prompt:
            user_prompt = f"{system_prompt.strip()}\n\n{prompt}"
        return self.retry_request(
            prompt=user_prompt,
            preferred_model=preferred_model,
            task_type=routed_task,
            max_tokens=max_tokens,
            temperature=temperature,
            response_format=response_format,
            prefer_groq_first=prefer_groq_first,
            prefer_gemini=prefer_gemini,
            context={"category": category or "", "title": title or "", "mode": mode or ""},
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
        prefer_groq_first: bool = True,
        prefer_gemini: bool = True,
        context: dict[str, Any] | None = None,
    ) -> AIResult:
        routed_task = detect_task_type(prompt=prompt, explicit=task_type)
        model = (preferred_model or "").strip() or select_best_model(routed_task, self.models)

        cache_key = self._cache_key(model=model, prompt=prompt, task_type=routed_task)
        cached = self._read_cache(cache_key)
        if cached:
            return cached

        attempts = self._build_provider_attempts(
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
            provider_count=1,
        )
        logger.info(
            "AI fallback chain task=%s providers=%s prompt_tokens_est=%s completion_cap=%s prompt_chars=%s",
            routed_task,
            len(attempts),
            token_estimate["prompt_tokens_est"],
            token_estimate["completion_cap"],
            len(prompt),
        )
        final = self._sequential_fallback(
            attempts=attempts,
            routed_task=routed_task,
            response_format=response_format,
            context=context,
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
        provider = "openrouter_free" if _is_free_model(model) else "openrouter_paid"
        effective_timeout = timeout_override if timeout_override is not None else self.timeout_seconds
        requested = max(1, min(max_tokens or self.max_tokens, 32768))
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": build_system_prompt(task_type)},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": requested,
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
            raise AIServiceError(
                f"OpenRouter timed out after {effective_timeout}s",
                status_code=408,
                error_type=ErrorType.TIMEOUT,
                retryable=True,
                provider=provider,
                model=model,
            ) from exc
        except requests.RequestException as exc:
            detail = exc.response.text[:600] if getattr(exc, "response", None) is not None else str(exc)
            classified = classify_provider_error(provider=provider, status_code=None, body=detail, model=model)
            _raise_classified(classified)

        raw = response.text or ""
        if response.status_code >= 400:
            classified = classify_provider_error(provider=provider, status_code=response.status_code, body=raw, model=model)
            _raise_classified(classified)
        data: Any = None
        try:
            data = response.json()
            text = extract_chat_completion_text(data, provider=provider)
            usage = data.get("usage") if isinstance(data, dict) else {}
            if not isinstance(usage, dict):
                usage = {}
            return {"text": text, "usage": usage}
        except Exception as exc:
            log_invalid_payload(provider=provider, model=model, raw=raw, parsed=data)
            raise AIServiceError(
                f"{provider}: invalid response payload",
                error_type=ErrorType.INVALID_RESPONSE,
                provider=provider,
                model=model,
            ) from exc

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
                classified = classify_provider_error(
                    provider="openrouter_paid",
                    status_code=response.status_code,
                    body=(response.text or "")[:400],
                    model=model,
                )
                _raise_classified(classified)
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
