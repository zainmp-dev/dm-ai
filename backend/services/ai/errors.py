from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class ErrorType(str, Enum):
    RATE_LIMIT = "RATE_LIMIT"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"
    MODEL_NOT_FOUND = "MODEL_NOT_FOUND"
    INVALID_REQUEST = "INVALID_REQUEST"
    AUTH_ERROR = "AUTH_ERROR"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    INVALID_RESPONSE = "INVALID_RESPONSE"
    TIMEOUT = "TIMEOUT"
    UNKNOWN = "UNKNOWN"


class ProviderHealth(str, Enum):
    AVAILABLE = "AVAILABLE"
    RATE_LIMITED = "RATE_LIMITED"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    ERROR = "ERROR"


_USER_STATUS: dict[ErrorType, str] = {
    ErrorType.RATE_LIMIT: "Temporarily rate limited",
    ErrorType.QUOTA_EXCEEDED: "Quota temporarily exceeded",
    ErrorType.INSUFFICIENT_CREDITS: "Insufficient credits",
    ErrorType.MODEL_NOT_FOUND: "Model configuration needs updating",
    ErrorType.INVALID_REQUEST: "Request was rejected",
    ErrorType.AUTH_ERROR: "Authentication failed",
    ErrorType.PROVIDER_ERROR: "Provider error",
    ErrorType.INVALID_RESPONSE: "Invalid response from provider",
    ErrorType.TIMEOUT: "Timed out",
    ErrorType.UNKNOWN: "Unavailable",
}

_PROVIDER_LABELS = {
    "groq": "Groq",
    "gemini": "Gemini",
    "openrouter": "OpenRouter",
    "openrouter_paid": "OpenRouter",
    "openrouter_free": "OpenRouter Free",
}


def provider_display_name(provider_id: str) -> str:
    if provider_id.startswith("openrouter_free"):
        return "OpenRouter Free"
    return _PROVIDER_LABELS.get(provider_id, provider_id)


def user_status_for(error_type: ErrorType) -> str:
    return _USER_STATUS.get(error_type, "Unavailable")


@dataclass
class ClassifiedError:
    error_type: ErrorType
    retryable: bool
    message: str
    provider: str = ""
    model: str = ""
    status_code: int | None = None

    @property
    def user_status(self) -> str:
        return user_status_for(self.error_type)

    def health(self) -> ProviderHealth:
        mapping = {
            ErrorType.RATE_LIMIT: ProviderHealth.RATE_LIMITED,
            ErrorType.QUOTA_EXCEEDED: ProviderHealth.QUOTA_EXCEEDED,
            ErrorType.INSUFFICIENT_CREDITS: ProviderHealth.INSUFFICIENT_CREDITS,
            ErrorType.MODEL_NOT_FOUND: ProviderHealth.MODEL_UNAVAILABLE,
        }
        return mapping.get(self.error_type, ProviderHealth.ERROR)


@dataclass
class ProviderOutcome:
    provider: str
    model: str
    error: ClassifiedError | None = None
    status: str = ""


def classify_provider_error(
    *,
    provider: str,
    status_code: int | None,
    body: str = "",
    message: str = "",
    model: str = "",
) -> ClassifiedError:
    text = f"{message or ''} {body or ''}".strip()
    lower = text.lower()
    code = status_code or 0

    if code == 408 or "timed out" in lower or "timeout" in lower:
        return ClassifiedError(ErrorType.TIMEOUT, True, text or "Request timed out", provider, model, code or 408)

    if code in (401, 403) or "invalid api key" in lower or "incorrect api key" in lower:
        return ClassifiedError(ErrorType.AUTH_ERROR, False, text, provider, model, code)

    if code == 402 or "insufficient credits" in lower or "requires more credits" in lower or "can only afford" in lower:
        return ClassifiedError(ErrorType.INSUFFICIENT_CREDITS, False, text, provider, model, code or 402)

    if code == 429:
        quota = any(
            token in lower
            for token in ("tpd", "tokens per day", "daily quota", "quota exceeded", "tokens/day")
        )
        if quota:
            return ClassifiedError(ErrorType.QUOTA_EXCEEDED, False, text, provider, model, 429)
        return ClassifiedError(ErrorType.RATE_LIMIT, True, text, provider, model, 429)

    if code == 404 or "no longer available" in lower or "is not found" in lower or "model_not_found" in lower:
        if "model" in lower or "no longer available" in lower or "not found" in lower:
            return ClassifiedError(ErrorType.MODEL_NOT_FOUND, False, text, provider, model, code or 404)

    if "invalid response" in lower or "invalid response payload" in lower or "unexpected response" in lower:
        return ClassifiedError(ErrorType.INVALID_RESPONSE, False, text, provider, model, code)

    if code in (400, 422) or "invalid request" in lower:
        return ClassifiedError(ErrorType.INVALID_REQUEST, False, text, provider, model, code)

    if code >= 500:
        return ClassifiedError(ErrorType.PROVIDER_ERROR, True, text, provider, model, code)

    if "connection" in lower or "temporarily" in lower:
        return ClassifiedError(ErrorType.PROVIDER_ERROR, True, text, provider, model, code)

    return ClassifiedError(ErrorType.UNKNOWN, False, text or "Unknown provider error", provider, model, code or None)


def public_failure_payload(outcomes: list[ProviderOutcome]) -> dict[str, Any]:
    seen: set[str] = set()
    providers: list[dict[str, str]] = []
    for row in outcomes:
        label = provider_display_name(row.provider)
        status = row.status or (row.error.user_status if row.error else "Unavailable")
        key = f"{label}:{status}"
        if key in seen:
            continue
        seen.add(key)
        providers.append({"name": label, "status": status})
    return {
        "message": "AI generation is temporarily unavailable.",
        "providers": providers,
        "action": "Please try again later or contact the administrator.",
    }
