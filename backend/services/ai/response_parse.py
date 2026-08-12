from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if item.get("text"):
                    parts.append(str(item["text"]))
                elif item.get("type") == "text" and item.get("text") is not None:
                    parts.append(str(item["text"]))
                elif item.get("content"):
                    parts.append(_as_text(item["content"]))
        return "".join(parts).strip()
    if isinstance(value, dict) and value.get("text"):
        return str(value["text"]).strip()
    return ""


def extract_chat_completion_text(data: Any, *, provider: str = "openrouter") -> str:
    """Normalize OpenAI-compatible chat payloads (OpenRouter, Groq) to a text string."""
    if not isinstance(data, dict):
        raise ValueError(f"{provider}: response is not an object")

    err = data.get("error")
    if err:
        if isinstance(err, dict):
            raise ValueError(str(err.get("message") or err))
        raise ValueError(str(err))

    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError(f"{provider}: missing choices")

    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message") if isinstance(first.get("message"), dict) else {}

    for candidate in (
        message.get("content"),
        message.get("reasoning"),
        first.get("text"),
        message.get("reasoning_content"),
        data.get("output_text"),
        data.get("output"),
        data.get("response"),
        data.get("text"),
    ):
        text = _as_text(candidate)
        if text:
            return text

    raise ValueError(f"{provider}: empty message content")


def extract_gemini_text(data: Any) -> str:
    if not isinstance(data, dict):
        raise ValueError("gemini: response is not an object")
    err = data.get("error")
    if isinstance(err, dict):
        raise ValueError(str(err.get("message") or err))
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("gemini: missing candidates")
    content = candidates[0].get("content") if isinstance(candidates[0], dict) else {}
    parts = content.get("parts") if isinstance(content, dict) else None
    text = _as_text(parts)
    if text:
        return text
    raise ValueError("gemini: empty candidate text")


def log_invalid_payload(*, provider: str, model: str, raw: str, parsed: Any | None = None) -> None:
    preview = (raw or "")[:1200]
    keys = list(parsed.keys())[:20] if isinstance(parsed, dict) else type(parsed).__name__
    logger.warning(
        "AI invalid response payload provider=%s model=%s keys=%s raw=%s",
        provider,
        model,
        keys,
        preview,
    )
    if logger.isEnabledFor(logging.DEBUG):
        try:
            logger.debug("AI raw payload provider=%s body=%s", provider, json.dumps(parsed)[:4000] if parsed is not None else preview)
        except Exception:
            logger.debug("AI raw payload provider=%s body=%s", provider, preview)
