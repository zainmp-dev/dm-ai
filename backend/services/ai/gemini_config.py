from __future__ import annotations

import logging

from config import settings

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

_DEPRECATED_GEMINI = frozenset(
    {
        "gemini-2.0-flash",
        "gemini-2.0-flash-001",
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash-exp",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-pro",
        "models/gemini-2.0-flash",
    }
)


def resolve_gemini_model(configured: str | None = None) -> str:
    """Return a usable Gemini model id. Deprecated 2.0/1.5 slugs are remapped."""
    raw = (configured if configured is not None else getattr(settings, "gemini_model", "") or "").strip()
    raw = raw.removeprefix("models/").strip()
    if not raw:
        return DEFAULT_GEMINI_MODEL
    lowered = raw.lower()
    if lowered in {item.removeprefix("models/") for item in _DEPRECATED_GEMINI} or lowered.startswith("gemini-2.0"):
        logger.warning(
            "GEMINI_MODEL %s is deprecated/unavailable; using %s. Set GEMINI_MODEL to a supported model.",
            raw,
            DEFAULT_GEMINI_MODEL,
        )
        return DEFAULT_GEMINI_MODEL
    return raw
