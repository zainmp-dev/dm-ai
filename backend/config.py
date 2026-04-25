from __future__ import annotations

import os
from dataclasses import dataclass
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
        if key and key not in os.environ:
            os.environ[key] = value


_load_local_env()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "").strip()
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "").strip()
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "mistralai/mixtral-8x7b").strip() or "mistralai/mixtral-8x7b"
    openrouter_timeout_seconds: int = int(os.getenv("OPENROUTER_TIMEOUT_SECONDS", "45"))

    meta_page_access_token: str = os.getenv("META_PAGE_ACCESS_TOKEN", "").strip()
    meta_page_id: str = os.getenv("META_PAGE_ID", "").strip()
    meta_ig_business_account_id: str = os.getenv("META_IG_BUSINESS_ACCOUNT_ID", "").strip()
    meta_graph_api_version: str = os.getenv("META_GRAPH_API_VERSION", "v22.0").strip() or "v22.0"

    linkedin_access_token: str = os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
    linkedin_author_urn: str = os.getenv("LINKEDIN_AUTHOR_URN", "").strip()
    linkedin_api_version: str = os.getenv("LINKEDIN_API_VERSION", "202405").strip() or "202405"

    scheduler_interval_seconds: int = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "60"))
    weekly_update_interval_days: int = int(os.getenv("WEEKLY_UPDATE_INTERVAL_DAYS", "7"))
    weekly_study_niche: str = os.getenv("WEEKLY_STUDY_NICHE", "AI marketing automation").strip() or "AI marketing automation"
    max_publish_retries: int = int(os.getenv("MAX_PUBLISH_RETRIES", "3"))
    request_timeout_seconds: int = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "30"))

    resend_api_key: str = os.getenv("RESEND_API_KEY", "").strip()
    resend_from_email: str = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev").strip() or "onboarding@resend.dev"
    notification_to_email: str = os.getenv("NOTIFICATION_TO_EMAIL", "").strip()

    cloudinary_cloud_name: str = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    cloudinary_api_key: str = os.getenv("CLOUDINARY_API_KEY", "").strip()
    cloudinary_api_secret: str = os.getenv("CLOUDINARY_API_SECRET", "").strip()
    cloudinary_folder: str = os.getenv("CLOUDINARY_FOLDER", "flowpilot").strip() or "flowpilot"


settings = Settings()
