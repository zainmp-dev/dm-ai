from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse


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


def _normalize_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def _public_site_origins_from_env() -> list[str]:
    """Same host hints used elsewhere (OAuth, absolute URLs); merged into CORS so prod cannot forget CORS_ORIGINS."""
    pub = _str_env_first("FLOWPILOT_PUBLIC_ORIGIN", "NEXT_PUBLIC_SITE_URL", "PUBLIC_APP_ORIGIN")
    if not pub:
        return []
    o = _normalize_origin(pub)
    if not o.startswith(("http://", "https://")):
        return []
    return [o]


def _www_or_apex_variant(origin: str) -> list[str]:
    """Allow both https://example.com and https://www.example.com when only one is configured."""
    norm = _normalize_origin(origin)
    out = [norm]
    try:
        u = urlparse(norm)
        if u.scheme not in ("http", "https") or not u.hostname:
            return out
        h = u.hostname.lower()
        if h in ("localhost", "127.0.0.1"):
            return out
        port = f":{u.port}" if u.port else ""
        if h.startswith("www."):
            bare = h.removeprefix("www.")
            alt = f"{u.scheme}://{bare}{port}"
        else:
            alt = f"{u.scheme}://www.{h}{port}"
        alt = _normalize_origin(alt)
        if alt != norm:
            out.append(alt)
    except Exception:
        pass
    return out


def _parse_cors_origins() -> list[str]:
    raw = _str_env("CORS_ORIGINS")
    explicit = [_normalize_origin(x) for x in raw.split(",") if raw and x.strip()]

    from_public_env: list[str] = []
    for site in _public_site_origins_from_env():
        from_public_env.extend(_www_or_apex_variant(site))

    if explicit:
        base = explicit
        extras = from_public_env
    elif from_public_env:
        base = from_public_env
        extras = []
    else:
        base = ["http://127.0.0.1:3000", "http://localhost:3000"]
        extras = []

    ordered: list[str] = []
    seen: set[str] = set()

    def add_one(o: str) -> None:
        o = _normalize_origin(o)
        if not o or o in seen:
            return
        seen.add(o)
        ordered.append(o)

    for p in base:
        add_one(p)

    for p in extras:
        add_one(p)

    return ordered


_LEGACY_OPENROUTER_MODELS: frozenset[str] = frozenset(
    {
        "mistralai/mixtral-8x7b",
    }
)
# Replaced with _DEFAULT_OPENROUTER_MODEL when the env still points at removed or invalid slugs.

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
    openrouter_base_url: str = field(
        default_factory=lambda: _str_env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1") or "https://openrouter.ai/api/v1"
    )
    openrouter_model: str = field(default_factory=_openrouter_model_from_env)
    openrouter_fast_model: str = field(default_factory=lambda: _str_env("FAST_MODEL", "openai/gpt-4o-mini") or "openai/gpt-4o-mini")
    openrouter_smart_model: str = field(
        default_factory=lambda: _str_env("SMART_MODEL", "anthropic/claude-sonnet-4") or "anthropic/claude-sonnet-4"
    )
    openrouter_vision_model: str = field(default_factory=lambda: _str_env("VISION_MODEL", "openai/gpt-4o") or "openai/gpt-4o")
    openrouter_image_model: str = field(
        default_factory=lambda: _str_env("IMAGE_MODEL", "openai/gpt-image-1") or "openai/gpt-image-1"
    )
    openrouter_timeout_seconds: int = field(default_factory=lambda: _int_env("OPENROUTER_TIMEOUT_SECONDS", 45))
    openrouter_retry_count: int = field(default_factory=lambda: _int_env("OPENROUTER_RETRY_COUNT", 2))
    openrouter_cache_ttl_seconds: int = field(default_factory=lambda: _int_env("OPENROUTER_CACHE_TTL_SECONDS", 90))
    openrouter_concurrency_limit: int = field(default_factory=lambda: _int_env("OPENROUTER_CONCURRENCY_LIMIT", 6))
    # Cap completion length so OpenRouter does not reserve a huge budget on each call (causes 402 when balance is small).
    # Lower OPENROUTER_MAX_TOKENS in .env only when credits are constrained. Agent 1/2 JSON needs room (512 truncates badly).
    openrouter_max_tokens: int = field(default_factory=lambda: _int_env("OPENROUTER_MAX_TOKENS", 8192))
    # Comma-separated OpenRouter model ids tried after the requested model and OPENROUTER_MODEL (quota/model errors only).
    openrouter_model_fallbacks: str = field(default_factory=lambda: _str_env("OPENROUTER_MODEL_FALLBACKS"))
    # Comma-separated free OpenRouter model ids (HTTP 402 last resort). Set to ``none`` to disable. When unset
    # and OPENROUTER_API_KEY is set, the stack defaults to ``openrouter/free`` (see ai_service._free_model_fallbacks).
    openrouter_free_fallbacks: str = field(default_factory=lambda: _str_env("OPENROUTER_FREE_FALLBACKS"))

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
    google_ai_api_key: str = field(default_factory=lambda: _str_env("GOOGLE_AI_API_KEY"))
    gemini_model: str = field(default_factory=lambda: _str_env("GEMINI_MODEL", "gemini-2.0-flash") or "gemini-2.0-flash")
    # Groq (OpenAI-compatible). Used ahead of Gemini/OpenRouter when keys are present.
    groq_api_key: str = field(default_factory=lambda: _str_env("GROQ_API_KEY"))
    groq_base_url: str = field(
        default_factory=lambda: _str_env("GROQ_BASE_URL", "https://api.groq.com/openai/v1") or "https://api.groq.com/openai/v1"
    )
    groq_model: str = field(
        default_factory=lambda: _str_env("GROQ_MODEL", "llama-3.3-70b-versatile") or "llama-3.3-70b-versatile"
    )
    # Pexels stock photos/video (optional — fills calendar media_preview when blank)
    pexels_api_key: str = field(default_factory=lambda: _str_env("PEXELS_API_KEY"))
    google_client_id: str = field(default_factory=lambda: _str_env("GOOGLE_CLIENT_ID"))
    google_client_secret: str = field(default_factory=lambda: _str_env("GOOGLE_CLIENT_SECRET"))
    google_redirect_uri: str = field(default_factory=lambda: _str_env("GOOGLE_REDIRECT_URI"))
    facebook_client_id: str = field(default_factory=lambda: _str_env_first("FACEBOOK_CLIENT_ID", "META_AUTH_CLIENT_ID"))
    facebook_client_secret: str = field(default_factory=lambda: _str_env_first("FACEBOOK_CLIENT_SECRET", "META_AUTH_CLIENT_SECRET"))
    facebook_redirect_uri: str = field(default_factory=lambda: _str_env("FACEBOOK_REDIRECT_URI"))
    # Public API prefix used in returned app-relative URLs (default keeps current dev behavior).
    public_api_prefix: str = field(default_factory=lambda: _str_env_first("FLOWPILOT_API_PREFIX", "PUBLIC_API_PREFIX") or "/api/backend")

    # Per-user sliding-window caps on AI endpoints (see utils.ai_usage_limits). Use max_requests <= 0 to disable a bucket.
    ai_rate_limit_strategy_max: int = field(default_factory=lambda: _int_env("AI_RATE_LIMIT_STRATEGY_MAX", 24))
    ai_rate_limit_strategy_window_seconds: int = field(
        default_factory=lambda: _int_env("AI_RATE_LIMIT_STRATEGY_WINDOW_SECONDS", 3600)
    )
    ai_rate_limit_content_max: int = field(default_factory=lambda: _int_env("AI_RATE_LIMIT_CONTENT_MAX", 24))
    ai_rate_limit_content_window_seconds: int = field(
        default_factory=lambda: _int_env("AI_RATE_LIMIT_CONTENT_WINDOW_SECONDS", 3600)
    )
    ai_rate_limit_creative_max: int = field(default_factory=lambda: _int_env("AI_RATE_LIMIT_CREATIVE_MAX", 48))
    ai_rate_limit_creative_window_seconds: int = field(
        default_factory=lambda: _int_env("AI_RATE_LIMIT_CREATIVE_WINDOW_SECONDS", 3600)
    )
    ai_rate_limit_search_max: int = field(default_factory=lambda: _int_env("AI_RATE_LIMIT_SEARCH_MAX", 80))
    ai_rate_limit_search_window_seconds: int = field(
        default_factory=lambda: _int_env("AI_RATE_LIMIT_SEARCH_WINDOW_SECONDS", 3600)
    )
    ai_rate_limit_analytics_max: int = field(default_factory=lambda: _int_env("AI_RATE_LIMIT_ANALYTICS_MAX", 40))
    ai_rate_limit_analytics_window_seconds: int = field(
        default_factory=lambda: _int_env("AI_RATE_LIMIT_ANALYTICS_WINDOW_SECONDS", 3600)
    )

    # CORS origins: CORS_ORIGINS list plus FLOWPILOT_PUBLIC_ORIGIN / NEXT_PUBLIC_SITE_URL / PUBLIC_APP_ORIGIN
    # (with optional www apex pair). Production typically sets PUBLIC_SITE once in .env and omits duplicate CORS list.
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(_parse_cors_origins()),
    )


def fresh_settings() -> Settings:
    """Re-load `backend/.env` into os.environ and return a new Settings (tokens, URLs, etc.)."""
    _load_local_env()
    return Settings()


settings = Settings()


def user_media_dir() -> Path:
    if settings.media_storage_path:
        return Path(settings.media_storage_path).resolve()
    return (Path(__file__).resolve().parent / "data" / "user_media").resolve()
