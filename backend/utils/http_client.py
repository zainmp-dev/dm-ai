from __future__ import annotations

from typing import Any

import requests


def _redact(text: str) -> str:
    out = text
    for marker in ("access_token", "refresh_token", "client_secret", "authorization"):
        out = out.replace(marker, f"{marker[:3]}***")
    return out


def request_json(method: str, url: str, *, timeout_seconds: int, log_context: str, **kwargs: Any) -> dict[str, Any]:
    try:
        res = requests.request(method, url, timeout=timeout_seconds, **kwargs)
        raw_text = res.text or ""
        if res.status_code >= 400:
            raise RuntimeError(f"{log_context} failed ({res.status_code}): {_redact(raw_text[:220])}")
        if not raw_text.strip():
            return {}
        payload = res.json()
    except requests.Timeout as exc:
        raise RuntimeError(f"{log_context} timed out") from exc
    except requests.RequestException as exc:
        raise RuntimeError(f"{log_context} request error") from exc
    except ValueError as exc:
        raise RuntimeError(f"{log_context} invalid JSON") from exc
    if not isinstance(payload, dict):
        return {"data": payload}
    return payload
