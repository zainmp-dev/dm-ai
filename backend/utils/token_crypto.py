from __future__ import annotations

import base64
import hashlib
from typing import Iterable

from cryptography.fernet import Fernet, InvalidToken

from config import fresh_settings

_PREFIX = "enc:v1:"


def _build_fernets() -> list[Fernet]:
    s = fresh_settings()
    key_material = s.token_encryption_keys.strip() or s.oauth_state_secret.strip()
    if not key_material:
        raise ValueError("TOKEN_ENCRYPTION_KEYS (or OAUTH_STATE_SECRET fallback) is required")
    raw_keys = [k.strip() for k in key_material.split(",") if k.strip()]
    fernets: list[Fernet] = []
    for raw in raw_keys:
        digest = hashlib.sha256(raw.encode("utf-8")).digest()
        f_key = base64.urlsafe_b64encode(digest)
        fernets.append(Fernet(f_key))
    return fernets


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    plain = value.strip()
    if not plain:
        return None
    if plain.startswith(_PREFIX):
        return plain
    f = _build_fernets()[0]
    token = f.encrypt(plain.encode("utf-8")).decode("utf-8")
    return f"{_PREFIX}{token}"


def decrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        return None
    if not raw.startswith(_PREFIX):
        return raw
    token = raw[len(_PREFIX) :]
    for f in _build_fernets():
        try:
            return f.decrypt(token.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            continue
    raise ValueError("Unable to decrypt stored token with current keys")


def mask_secret(value: str | None) -> str:
    if not value:
        return ""
    trimmed = value.strip()
    if len(trimmed) <= 8:
        return "***"
    return f"{trimmed[:4]}***{trimmed[-4:]}"
