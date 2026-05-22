"""Password hashing and verification (PBKDF2-SHA256). Replaces legacy plaintext storage."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from typing import Callable

_HASH_PREFIX = "pbkdf2_sha256$"
_DEFAULT_ROUNDS = 260_000


def is_password_hash(stored: str | None) -> bool:
    return bool((stored or "").strip().startswith(_HASH_PREFIX))


def hash_password(plain: str) -> str:
    raw = (plain or "").strip()
    if not raw:
        raise ValueError("Password must not be empty")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", raw.encode("utf-8"), salt, _DEFAULT_ROUNDS)
    salt_b64 = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    digest_b64 = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return f"{_HASH_PREFIX}{_DEFAULT_ROUNDS}${salt_b64}${digest_b64}"


def verify_password(plain: str, stored: str | None) -> tuple[bool, str | None]:
    """
    Verify credentials. Returns (ok, upgraded_hash).
    When legacy plaintext matches, upgraded_hash is the new hash to persist.
    """
    raw = (plain or "").strip()
    saved = str(stored or "")
    if not raw or not saved:
        return False, None

    if is_password_hash(saved):
        return _verify_hashed(raw, saved), None

    # Legacy plaintext — constant-time compare, then upgrade on success.
    if hmac.compare_digest(saved, raw):
        try:
            return True, hash_password(raw)
        except ValueError:
            return True, None
    return False, None


def _verify_hashed(plain: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    rounds_s, salt_b64, digest_b64 = parts[1], parts[2], parts[3]
    try:
        rounds = int(rounds_s)
    except ValueError:
        return False
    if rounds < 100_000:
        return False

    def _pad(b64: str) -> bytes:
        pad = "=" * (-len(b64) % 4)
        return base64.urlsafe_b64decode(b64 + pad)

    try:
        salt = _pad(salt_b64)
        expected = _pad(digest_b64)
    except Exception:
        return False

    actual = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, rounds)
    return hmac.compare_digest(actual, expected)


def password_storage_kind(password_raw: str | None, auth_provider: str | None) -> str:
    """Admin UI label — never exposes the secret itself."""
    if str(auth_provider or "").strip():
        return "oauth_placeholder"
    raw = str(password_raw or "").strip()
    if not raw:
        return "none"
    if is_password_hash(raw):
        return "hashed"
    return "legacy_plaintext"
