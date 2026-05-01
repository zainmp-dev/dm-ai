from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def new_nonce() -> str:
    return secrets.token_urlsafe(24)


def encode_state(payload: dict[str, Any], secret: str) -> str:
    body = _b64url_encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
    sig = _b64url_encode(hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_state(state: str, secret: str, *, max_age_seconds: int = 300) -> dict[str, Any]:
    try:
        body, provided_sig = state.split(".", 1)
    except ValueError as exc:
        raise ValueError("invalid state format") from exc
    expected_sig = _b64url_encode(hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(expected_sig, provided_sig):
        raise ValueError("invalid state signature")
    payload = json.loads(_b64url_decode(body).decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("invalid state payload")
    ts = int(payload.get("ts", 0))
    now = int(time.time())
    # Strict anti-replay window: reject future timestamps and anything older than 5 minutes.
    if ts <= 0 or ts > now or (now - ts) > max_age_seconds:
        raise ValueError("state expired")
    return payload
