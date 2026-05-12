"""Password hashing for flowpilot_users (bcrypt). Legacy plaintext values are upgraded on successful login."""

from __future__ import annotations

import hmac

import bcrypt


def hash_password(plain: str) -> str:
    """Hash a UTF-8 password for storage (bcrypt)."""
    digest = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12))
    return digest.decode("ascii")


def verify_and_maybe_upgrade_password(stored: str, plain: str) -> tuple[bool, str | None]:
    """
    Verify password against stored value.

    Returns (ok, new_hash). When the stored value was legacy plaintext and matched,
    new_hash is a bcrypt hash to persist; otherwise None.
    """
    raw = (stored or "").strip()
    if raw.startswith("$2"):
        try:
            ok = bcrypt.checkpw(plain.encode("utf-8"), raw.encode("ascii"))
        except ValueError:
            return False, None
        return ok, None
    if hmac.compare_digest(raw, plain):
        return True, hash_password(plain)
    return False, None
