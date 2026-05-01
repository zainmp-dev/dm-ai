from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_local_env() -> None:
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        row = line.strip()
        if not row or row.startswith("#") or "=" not in row:
            continue
        key, value = row.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # `.env` is the source of truth for local dev: override stale vars from the shell/IDE/OS.
        if key:
            os.environ[key] = value


_load_local_env()


def _str_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _str_env_first(*names: str) -> str:
    for n in names:
        v = os.getenv(n, "").strip()
        if v:
            return v
    return ""


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw or not str(raw).strip():
        return default
    return int(str(raw).strip())


_DEFAULT_OPENROUTER_MODEL = "openai/gpt-5-mini"
# Replaced with _DEFAULT_OPENROUTER_MODEL when the env still points at removed or invalid slugs.
_LEGACY_OPENROUTER_MODELS: frozenset[str] = frozenset(
    {
        "mistralai/mixtral-8x7b",
    }
)


def _openrouter_model_from_env() -> str:
    raw = (_str_env("OPENROUTER_MODEL", _DEFAULT_OPENROUTER_MODEL) or _DEFAULT_OPENROUTER_MODEL).strip()
    if not raw or raw in _LEGACY_OPENROUTER_MODELS:
        return _DEFAULT_OPENROUTER_MODEL
    return raw


@dataclass(frozen=True)
class Settings:
    # default_factory: each new Settings() re-reads os.environ (so .env edits apply without stale class-level defaults)
    database_url: str = field(default_factory=lambda: _str_env("DATABASE_URL"))
    openrouter_api_key: str = field(default_factory=lambda: _str_env("OPENROUTER_API_KEY"))
    openrouter_model: str = field(default_factory=_openrouter_model_from_env)
    openrouter_timeout_seconds: int = field(default_factory=lambda: _int_env("OPENROUTER_TIMEOUT_SECONDS", 45))
    # Cap completion length so OpenRouter does not reserve a huge budget on each call (causes 402 when balance is small).
    # Lower OPENROUTER_MAX_TOKENS in .env only when credits are constrained. Agent 1/2 JSON needs room (512 truncates badly).
    openrouter_max_tokens: int = field(default_factory=lambda: _int_env("OPENROUTER_MAX_TOKENS", 8192))
    # Comma-separated OpenRouter model ids tried after the requested model and OPENROUTER_MODEL (quota/model errors only).
    openrouter_model_fallbacks: str = field(default_factory=lambda: _str_env("OPENROUTER_MODEL_FALLBACKS"))

    meta_graph_api_version: str = field(
        default_factory=lambda: _str_env("META_GRAPH_API_VERSION", "v22.0") or "v22.0"
    )

    linkedin_client_id: str = field(default_factory=lambda: _str_env("LINKEDIN_CLIENT_ID"))
    linkedin_client_secret: str = field(default_factory=lambda: _str_env("LINKEDIN_CLIENT_SECRET"))
    linkedin_redirect_uri: str = field(default_factory=lambda: _str_env("LINKEDIN_REDIRECT_URI"))
    linkedin_author_urn: str = field(default_factory=lambda: _str_env("LINKEDIN_AUTHOR_URN"))
    linkedin_api_version: str = field(
        default_factory=lambda: _str_env("LINKEDIN_API_VERSION", "202405") or "202405"
    )

    # Support both META_* and FACEBOOK_* naming to avoid broken OAuth from env key mismatches.
    meta_app_id: str = field(default_factory=lambda: _str_env_first("META_APP_ID", "FACEBOOK_APP_ID", "FB_APP_ID"))
    meta_app_secret: str = field(
        default_factory=lambda: _str_env_first("META_APP_SECRET", "FACEBOOK_APP_SECRET", "FB_APP_SECRET")
    )
    meta_redirect_uri: str = field(
        default_factory=lambda: _str_env_first("META_REDIRECT_URI", "FACEBOOK_REDIRECT_URI", "FB_REDIRECT_URI")
    )
    scheduler_interval_seconds: int = field(default_factory=lambda: _int_env("SCHEDULER_INTERVAL_SECONDS", 60))
    weekly_update_interval_days: int = field(default_factory=lambda: _int_env("WEEKLY_UPDATE_INTERVAL_DAYS", 7))
    weekly_study_niche: str = field(
        default_factory=lambda: _str_env("WEEKLY_STUDY_NICHE", "AI marketing automation") or "AI marketing automation"
    )
    max_publish_retries: int = field(default_factory=lambda: _int_env("MAX_PUBLISH_RETRIES", 3))
    request_timeout_seconds: int = field(default_factory=lambda: _int_env("REQUEST_TIMEOUT_SECONDS", 30))

    resend_api_key: str = field(default_factory=lambda: _str_env("RESEND_API_KEY"))
    resend_from_email: str = field(
        default_factory=lambda: _str_env("RESEND_FROM_EMAIL", "onboarding@resend.dev") or "onboarding@resend.dev"
    )
    notification_to_email: str = field(default_factory=lambda: _str_env("NOTIFICATION_TO_EMAIL"))

    cloudinary_cloud_name: str = field(default_factory=lambda: _str_env("CLOUDINARY_CLOUD_NAME"))
    cloudinary_api_key: str = field(default_factory=lambda: _str_env("CLOUDINARY_API_KEY"))
    cloudinary_api_secret: str = field(default_factory=lambda: _str_env("CLOUDINARY_API_SECRET"))
    cloudinary_folder: str = field(default_factory=lambda: _str_env("CLOUDINARY_FOLDER", "flowpilot") or "flowpilot")

    # On-disk user uploads (served at GET /media-assets/...; URLs stored as /api/backend/media-assets/...)
    media_storage_path: str = field(default_factory=lambda: _str_env("MEDIA_STORAGE_PATH"))
    # Public origin of the Next.js app (no trailing slash). Used for OAuth callback URL fallback
    # and for absolute media URLs in API responses.
    public_app_origin: str = field(
        default_factory=lambda: _str_env_first("FLOWPILOT_PUBLIC_ORIGIN", "NEXT_PUBLIC_SITE_URL", "PUBLIC_APP_ORIGIN")
    )
    oauth_state_secret: str = field(default_factory=lambda: _str_env("OAUTH_STATE_SECRET"))
    token_encryption_keys: str = field(default_factory=lambda: _str_env("TOKEN_ENCRYPTION_KEYS"))
    # Public API prefix used in returned app-relative URLs (default keeps current dev behavior).
    public_api_prefix: str = field(default_factory=lambda: _str_env_first("FLOWPILOT_API_PREFIX", "PUBLIC_API_PREFIX") or "/api/backend")


def fresh_settings() -> Settings:
    """Re-load `backend/.env` into os.environ and return a new Settings (tokens, URLs, etc.)."""
    _load_local_env()
    return Settings()


settings = Settings()


def user_media_dir() -> Path:
    if settings.media_storage_path:
        return Path(settings.media_storage_path).resolve()
    return (Path(__file__).resolve().parent / "data" / "user_media").resolve()
