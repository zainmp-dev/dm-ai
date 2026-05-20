"""Per-user sliding-window limits for AI-heavy HTTP endpoints (abuse / overspend guard)."""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException

from config import Settings
from utils.rate_limit import check_rate_limit

AiLimitCategory = Literal["strategy", "content", "creative", "search", "analytics"]


def _bucket(settings: Settings, category: AiLimitCategory) -> tuple[int, int]:
    if category == "strategy":
        return settings.ai_rate_limit_strategy_max, settings.ai_rate_limit_strategy_window_seconds
    if category == "content":
        return settings.ai_rate_limit_content_max, settings.ai_rate_limit_content_window_seconds
    if category == "creative":
        return settings.ai_rate_limit_creative_max, settings.ai_rate_limit_creative_window_seconds
    if category == "search":
        return settings.ai_rate_limit_search_max, settings.ai_rate_limit_search_window_seconds
    return settings.ai_rate_limit_analytics_max, settings.ai_rate_limit_analytics_window_seconds


def enforce_ai_usage_limit(settings: Settings, *, user_id: str, category: AiLimitCategory) -> None:
    max_requests, window_seconds = _bucket(settings, category)
    if max_requests <= 0 or window_seconds <= 0:
        return
    key = f"ai:{category}:user:{user_id}"
    if check_rate_limit(key, max_requests=max_requests, window_seconds=window_seconds):
        return
    raise HTTPException(
        status_code=429,
        detail=(
            f"AI request limit reached for this account ({category}). "
            "Wait and try again, or ask an administrator to raise AI_RATE_LIMIT_* on the server."
        ),
    )


def public_rate_limits(settings: Settings) -> dict[str, dict[str, int | str]]:
    """Shape returned to admin UI — no secrets."""
    out: dict[str, dict[str, int | str]] = {}
    for cat in ("strategy", "content", "creative", "search", "analytics"):
        m, w = _bucket(settings, cat)  # type: ignore[arg-type]
        active = m > 0 and w > 0
        out[cat] = {
            "max_requests_per_window": m,
            "window_seconds": w,
            "enforcement": "on" if active else "off",
        }
    return out
