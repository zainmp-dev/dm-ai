"""PII masking, secret redaction, and safe serialization for logs and admin APIs."""

from __future__ import annotations

import re
from typing import Any

# Column names never returned raw from admin DB browser (values replaced with [REDACTED]).
SENSITIVE_DB_COLUMNS: frozenset[str] = frozenset(
    {
        "password",
        "access_token",
        "refresh_token",
        "meta_page_token",
        "token",
        "api_key",
        "client_secret",
        "oauth_state_secret",
        "token_encryption_keys",
    }
)

_EMAIL_RE = re.compile(r"^([^@\s]{1,64})@([^@\s]{1,255})$")
_BEARER_RE = re.compile(r"Bearer\s+[A-Za-z0-9._\-]+", re.IGNORECASE)
_SK_OR_RE = re.compile(r"sk-or-v1-[A-Za-z0-9]+", re.IGNORECASE)
_GSK_RE = re.compile(r"gsk_[A-Za-z0-9]+", re.IGNORECASE)
_FLOWPILOT_TOKEN_RE = re.compile(r"flowpilot-[A-Za-z0-9._\-]+", re.IGNORECASE)


def mask_email(email: str | None, *, reveal: bool = False) -> str:
    """Mask email for support-tier admin views. Full value when reveal=True."""
    raw = (email or "").strip()
    if reveal or not raw:
        return raw
    m = _EMAIL_RE.match(raw)
    if not m:
        return "***"
    local, domain = m.group(1), m.group(2)
    if len(local) <= 1:
        masked_local = "*"
    elif len(local) == 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[0] + "***" + local[-1]
    return f"{masked_local}@{domain}"


def mask_name(name: str | None, *, reveal: bool = False) -> str:
    raw = (name or "").strip()
    if reveal or len(raw) <= 2:
        return raw
    return raw[0] + "***" + (raw[-1] if len(raw) > 1 else "")


def mask_user_id(user_id: str | None, *, reveal: bool = False) -> str:
    raw = (user_id or "").strip()
    if reveal or len(raw) <= 8:
        return raw
    return raw[:4] + "…" + raw[-4:]


def secret_tail(raw: str | None) -> str | None:
    """Last four characters only — for confirming which API key is configured."""
    t = (raw or "").strip()
    if not t:
        return None
    return ("…" + t[-4:]) if len(t) > 4 else "…****"


def redact_text(text: str, *, max_len: int = 1200) -> str:
    """Strip bearer tokens, API keys, and flowpilot session tokens from log/error strings."""
    s = (text or "")[:max_len]
    s = _BEARER_RE.sub("Bearer [REDACTED]", s)
    s = _SK_OR_RE.sub("sk-or-v1-[REDACTED]", s)
    s = _GSK_RE.sub("gsk_[REDACTED]", s)
    s = _FLOWPILOT_TOKEN_RE.sub("flowpilot-[REDACTED]", s)
    return s


def truncate_log_label(label: str | None, *, max_len: int = 60) -> str:
    raw = (label or "").strip()
    if len(raw) <= max_len:
        return raw
    return raw[: max_len - 1] + "…"


def sanitize_db_cell(column: str, value: Any) -> Any:
    col = (column or "").strip().lower()
    if col in SENSITIVE_DB_COLUMNS:
        if value is None or str(value).strip() == "":
            return value
        return "[REDACTED]"
    return value


def sanitize_db_row(row: dict[str, Any]) -> dict[str, Any]:
    return {str(k): sanitize_db_cell(str(k), v) for k, v in row.items()}


def admin_viewer_may_see_contact_pii(role: str | None) -> bool:
    """True when the operator may see full email/name in list APIs."""
    from utils.admin_rbac import PERM_USER_CREDENTIALS, role_has_permission

    return role_has_permission(role, PERM_USER_CREDENTIALS)
