"""Lightweight token estimates for logging and budget guardrails (not billing-accurate)."""

from __future__ import annotations

from typing import Any


def estimate_tokens(text: str) -> int:
    """Rough input-token estimate: ~4 characters per token for mixed English/HTML/JSON."""
    cleaned = (text or "").strip()
    if not cleaned:
        return 0
    return max(1, len(cleaned) // 4)


def estimate_prompt_tokens(*, system_prompt: str, user_prompt: str) -> int:
    return estimate_tokens(system_prompt) + estimate_tokens(user_prompt)


def estimate_completion_budget(max_tokens: int | None) -> int:
    return max(0, int(max_tokens or 0))


def estimate_total_request_tokens(
    *,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int | None,
    provider_count: int = 1,
) -> dict[str, int]:
    prompt_tokens = estimate_prompt_tokens(system_prompt=system_prompt, user_prompt=user_prompt)
    completion_cap = estimate_completion_budget(max_tokens)
    per_provider = prompt_tokens + completion_cap
    return {
        "prompt_tokens_est": prompt_tokens,
        "completion_cap": completion_cap,
        "total_per_provider_est": per_provider,
        "provider_count": max(1, provider_count),
        "total_race_est": per_provider * max(1, provider_count),
    }


def log_usage_vs_estimate(
    logger: Any,
    *,
    label: str,
    estimate: dict[str, int],
    usage: dict[str, Any] | None,
    model_used: str,
    latency_ms: int,
) -> None:
    usage = usage or {}
    prompt_actual = int(usage.get("prompt_tokens") or 0)
    completion_actual = int(usage.get("completion_tokens") or 0)
    total_actual = int(usage.get("total_tokens") or 0) or (prompt_actual + completion_actual)
    logger.info(
        "%s model=%s latency_ms=%s prompt_tokens_est=%s completion_cap=%s total_est=%s "
        "prompt_tokens_actual=%s completion_tokens_actual=%s total_tokens_actual=%s providers=%s",
        label,
        model_used,
        latency_ms,
        estimate.get("prompt_tokens_est", 0),
        estimate.get("completion_cap", 0),
        estimate.get("total_per_provider_est", 0),
        prompt_actual,
        completion_actual,
        total_actual,
        estimate.get("provider_count", 1),
    )
