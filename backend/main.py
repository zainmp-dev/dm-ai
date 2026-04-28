from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import mimetypes
import re
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.routing import APIRoute
from pydantic import BaseModel, Field
from starlette.datastructures import UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from agents import (
    DEFAULT_WORKSPACE_CALENDAR_DAYS,
    AgentError,
    generate_reviewed_content,
    generate_workspace_research,
    get_openrouter_key_info_for_ui,
    run_analytics_agent,
    run_workspace_content_agent,
    run_workspace_setup_master,
    run_workspace_search_agent,
    suggest_master_content_post,
)
from config import fresh_settings, settings, user_media_dir
from database import Content, create_many_content, get_all_content, get_content, get_db, init_db, increment_retry, update_status
from emailer import content_action_email, safe_send_email
from publisher import publish_post
from scheduler import scheduler_loop


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _http_for_agent_error(exc: AgentError) -> tuple[int, str]:
    """Map OpenRouter / agent failures to HTTP status for clearer client errors."""
    msg = str(exc).strip()
    low = msg.lower()
    if '"code":402' in low or " 402" in low or "payment required" in low or "more credits" in low:
        return 402, (msg[:650] + "…") if len(msg) > 650 else msg
    return 502, msg[:800] + "…" if len(msg) > 800 else msg


class GenerateRequest(BaseModel):
    niche: str = Field(min_length=2, max_length=300)


class ApproveRequest(BaseModel):
    scheduled_time: datetime


class WorkspaceApproveRequest(BaseModel):
    content_id: str = Field(min_length=1, max_length=120)
    platform: str | None = Field(default=None, max_length=32)
    platforms: list[str] = Field(default_factory=list)


class WorkspaceContentIdRequest(BaseModel):
    content_id: str = Field(min_length=1, max_length=120)


class WorkspaceScheduleRequest(BaseModel):
    content_id: str = Field(min_length=1, max_length=120)
    scheduled_at: datetime


class WorkspacePublishRequest(BaseModel):
    content_ids: list[str] = Field(default_factory=list)


class ProfileRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    company: str | None = Field(default=None, max_length=300)
    timezone: str | None = Field(default=None, max_length=80)


class PreferencesRequest(BaseModel):
    default_platform: str | None = Field(default=None, max_length=32)
    quiet_hours_enabled: bool | None = None
    approval_digest: str | None = Field(default=None, max_length=20)


class MediaUploadRequest(BaseModel):
    data_url: str = Field(min_length=1)
    file_name: str | None = Field(default=None, max_length=300)
    media_type: str | None = Field(default="Image", max_length=20)


class MediaRemoveRequest(BaseModel):
    asset_id: str = Field(min_length=1, max_length=200)


class MediaAddByUrlRequest(BaseModel):
    media_url: str = Field(min_length=12, max_length=1000)
    name: str | None = Field(default=None, max_length=300)
    media_type: str | None = Field(default=None, max_length=20)


class AnalyticsRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    reach: int = Field(default=0, ge=0)
    ai_model: str | None = Field(default=None, max_length=200)


class WorkspaceSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    ai_model: str | None = Field(default=None, max_length=200)


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class CompetitorInput(BaseModel):
    name: str = Field(default="", max_length=200)
    website: str = Field(default="", max_length=500)
    focus: str = Field(default="", max_length=500)


class WorkspaceRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=300)
    website: str = Field(default="", max_length=500)
    scenario: str = Field(default="b2b-saas", max_length=50)
    primary_region: str = Field(default="uae-india", max_length=32)
    workspace_owner_name: str = Field(default="", max_length=200)
    workspace_owner_email: str = Field(default="", max_length=320)
    ai_model: str | None = Field(default=None, max_length=200)
    competitors: list[CompetitorInput] = Field(default_factory=list)


class StrategyRequest(BaseModel):
    company_name: str = Field(default="", max_length=300)
    website: str = Field(default="", max_length=500)
    scenario: str = Field(default="", max_length=50)
    ai_model: str | None = Field(default=None, max_length=200)
    competitors: list[CompetitorInput] = Field(default_factory=list)


class ContentLibraryRequest(BaseModel):
    action: str = Field(default="generate", max_length=20)
    content_id: str | None = Field(default=None, max_length=120)
    title: str | None = Field(default=None, max_length=220)
    content_text: str | None = Field(default=None, max_length=5000)
    calendar_days: int | None = Field(default=10, ge=1, le=90)
    media_type: str | None = Field(default="Image", max_length=20)
    media_preview: str | None = Field(default=None, max_length=1000)
    scheduled_at: datetime | None = None
    auto_activate: bool | None = False
    ai_model: str | None = Field(default=None, max_length=200)
    suggest_hint: str | None = Field(default=None, max_length=500)
    selected_platform: str | None = Field(default=None, max_length=32)


class AuthUserResponse(BaseModel):
    name: str
    email: str


class AuthResponse(BaseModel):
    token: str
    user: AuthUserResponse


class ContentResponse(BaseModel):
    id: uuid.UUID
    platform: str
    content: str
    media_url: str | None
    status: str
    scheduled_time: datetime | None
    retry_count: int
    created_at: datetime


class GenerateResponse(BaseModel):
    strategy: dict[str, Any]
    content: list[ContentResponse]


class PublishResponse(BaseModel):
    success: bool
    message: str
    content: ContentResponse


def auth_token(user_id: str) -> str:
    return f"flowpilot-{user_id}-{uuid.uuid4().hex}"


def serialize_auth_user(row: dict[str, Any]) -> AuthUserResponse:
    return AuthUserResponse(name=str(row["name"]), email=str(row["email"]))


def _cloudinary_uploads_ready() -> bool:
    return bool(
        settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret
    )


def default_workspace_snapshot(user: dict[str, Any] | None = None) -> dict[str, Any]:
    profile_name = str(user["name"]) if user else ""
    profile_email = str(user["email"]) if user else ""
    return {
        "company_name": "",
        "company_website": "",
        "workspace_scenario": "b2b-saas",
        "primary_region": "uae-india",
        "workspace_configured": False,
        "cloudinary_uploads_ready": _cloudinary_uploads_ready(),
        "strategy": None,
        "competitors": [],
        "content": [],
        "leads": [],
        "activities": [],
        "publishing_log": [],
        "media_library": [],
        "integrations": {
            "linkedin": {"connected": False, "account_name": None, "account_handle": None},
            "meta": {"connected": False, "account_name": None, "account_handle": None},
        },
        "profile": {"name": profile_name, "email": profile_email, "company": "", "timezone": "Asia/Kolkata"},
        "preferences": {"default_platform": "linkedin", "quiet_hours_enabled": True, "approval_digest": "daily"},
        "crm_last_bulk_status": "Pending",
        "campaigns": [],
        "engagement_series": [],
        "leads_growth": [],
        "master_setup": None,
        "post_analytics": [],
    }


def _normalize_primary_region(value: str | None) -> str:
    v = (value or "").strip().lower()
    if v in {"uae-gcc", "india", "uae-india"}:
        return v
    return "uae-india"


def _default_timezone_for_region(region: str) -> str:
    if region == "uae-gcc":
        return "Asia/Dubai"
    if region in {"india", "uae-india"}:
        return "Asia/Kolkata"
    return "Asia/Kolkata"


def get_current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = authorization.removeprefix("Bearer ").strip()
    if not token.startswith("flowpilot-"):
        raise HTTPException(status_code=401, detail="Invalid auth token")

    user_id = token.removeprefix("flowpilot-").rsplit("-", 1)[0]
    row = db.execute(
        text("select id, name, email from flowpilot_users where id = :id"),
        {"id": user_id},
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid auth token")

    return dict(row)


def workspace_snapshot(db: Session, workspace_id: str, user: dict[str, Any]) -> dict[str, Any]:
    workspace = db.execute(
        text("select * from flowpilot_workspace where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if workspace is None:
        return default_workspace_snapshot(user)

    snapshot = default_workspace_snapshot(user)
    snapshot.update(
        {
            "company_name": workspace["company_name"],
            "company_website": workspace["company_website"],
            "workspace_scenario": workspace["workspace_scenario"],
            "primary_region": _normalize_primary_region(str(workspace.get("primary_region", "uae-india") or "uae-india")),
            "workspace_configured": workspace["workspace_configured"],
            "crm_last_bulk_status": workspace["crm_last_bulk_status"],
        }
    )

    raw_ms = workspace.get("master_setup_json")
    if raw_ms is not None and str(raw_ms).strip():
        try:
            snapshot["master_setup"] = json.loads(str(raw_ms))
        except (json.JSONDecodeError, TypeError):
            snapshot["master_setup"] = None
    else:
        snapshot["master_setup"] = None

    strategy = db.execute(
        text("select * from flowpilot_strategy where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if strategy is not None:
        sd = dict(strategy)
        if sd.get("data_json"):
            sd["strategy_blob_present"] = True
            del sd["data_json"]
        snapshot["strategy"] = sd

    for key, table, order_by in (
        ("competitors", "flowpilot_competitors", "name"),
        ("content", "flowpilot_content", "coalesce(updated_at, created_at) desc nulls last, created_at desc"),
        ("leads", "flowpilot_leads", "captured_at desc"),
        ("activities", "flowpilot_activities", "created_at desc"),
        ("publishing_log", "flowpilot_publishing_log", "timestamp desc"),
        ("campaigns", "flowpilot_campaigns", "name"),
        ("post_analytics", "flowpilot_post_analytics", "updated_at desc"),
    ):
        snapshot[key] = [
            dict(row)
            for row in db.execute(
                text(f"select * from {table} where workspace_id = :workspace_id order by {order_by}"),
                {"workspace_id": workspace_id},
            ).mappings().all()
        ]

    profile = db.execute(
        text("select name, email, company, timezone from flowpilot_profile where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if profile is not None:
        snapshot["profile"] = dict(profile)

    preferences = db.execute(
        text("select default_platform, quiet_hours_enabled, approval_digest from flowpilot_preferences where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if preferences is not None:
        snapshot["preferences"] = dict(preferences)

    integrations = {
        "linkedin": {"connected": False, "account_name": None, "account_handle": None},
        "meta": {"connected": False, "account_name": None, "account_handle": None},
    }
    for row in db.execute(
        text("select platform, connected, account_name, account_handle from flowpilot_integrations where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().all():
        platform = str(row["platform"])
        if platform in integrations:
            integrations[platform] = {
                "connected": row["connected"],
                "account_name": row["account_name"],
                "account_handle": row["account_handle"],
            }
    snapshot["integrations"] = integrations

    snapshot["engagement_series"] = [
        dict(row)
        for row in db.execute(
            text("select name, engagement, reach from flowpilot_engagement_series where workspace_id = :workspace_id order by position"),
            {"workspace_id": workspace_id},
        ).mappings().all()
    ]
    snapshot["leads_growth"] = [
        dict(row)
        for row in db.execute(
            text("select name, leads from flowpilot_leads_growth where workspace_id = :workspace_id order by position"),
            {"workspace_id": workspace_id},
        ).mappings().all()
    ]

    snapshot["media_library"] = [
        dict(row)
        for row in db.execute(
            text(
                "select id, name, media_type, media_url, created_at from flowpilot_media_library "
                "where workspace_id = :workspace_id order by created_at desc"
            ),
            {"workspace_id": workspace_id},
        ).mappings().all()
    ]

    return snapshot


def notify_content_action(action: str, row: Content, scheduled_time: datetime | None = None) -> None:
    safe_send_email(
        subject=f"FlowPilot content {action}: {row.platform.title()}",
        html_body=content_action_email(
            action=action,
            platform=row.platform,
            content=row.content,
            scheduled_time=scheduled_time.isoformat() if scheduled_time else None,
        ),
    )


def serialize_content(row: Content) -> ContentResponse:
    return ContentResponse(
        id=row.id,
        platform=row.platform,
        content=row.content,
        media_url=row.media_url,
        status=row.status,
        scheduled_time=row.scheduled_time,
        retry_count=row.retry_count,
        created_at=row.created_at,
    )


def normalize_competitor_inputs(items: list[CompetitorInput]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in items:
        name = item.name.strip()
        website = item.website.strip()
        focus = item.focus.strip()
        if not name and not website and not focus:
            continue
        normalized.append({"name": name, "website": website, "focus": focus})
    return normalized[:10]


def _compact_workspace_for_search(snapshot: dict[str, Any]) -> str:
    """Trim server snapshot JSON for the workspace Q&A agent (token budget)."""
    out: dict[str, Any] = {
        "company_name": snapshot.get("company_name"),
        "company_website": snapshot.get("company_website"),
        "workspace_scenario": snapshot.get("workspace_scenario"),
        "primary_region": snapshot.get("primary_region"),
        "workspace_configured": snapshot.get("workspace_configured"),
    }
    strat = snapshot.get("strategy")
    if isinstance(strat, dict):
        out["strategy"] = {
            k: strat[k]
            for k in ("target_audience", "content_themes", "platform_focus", "market_gaps")
            if k in strat
        }
    comps = snapshot.get("competitors")
    if isinstance(comps, list):
        slim: list[dict[str, Any]] = []
        for c in comps[:10]:
            if not isinstance(c, dict):
                continue
            pos = str(c.get("positioning", "") or "")
            slim.append(
                {
                    "name": c.get("name"),
                    "domain": c.get("domain"),
                    "positioning": pos[:450] + ("…" if len(pos) > 450 else ""),
                    "market_gap": c.get("market_gap"),
                    "market_rank": c.get("market_rank"),
                }
            )
        out["competitors"] = slim
    cont = snapshot.get("content")
    if isinstance(cont, list):
        slim_c: list[dict[str, Any]] = []
        for row in cont[:24]:
            if not isinstance(row, dict):
                continue
            body = str(row.get("content_text") or row.get("content") or "")
            slim_c.append(
                {
                    "title": row.get("title"),
                    "status": row.get("status"),
                    "platform": row.get("selected_platform") or row.get("platform"),
                    "excerpt": body[:220] + ("…" if len(body) > 220 else ""),
                }
            )
        out["recent_content"] = slim_c
    acts = snapshot.get("activities")
    if isinstance(acts, list):
        out["recent_activities"] = [
            {"text": a.get("text"), "created_at": str(a.get("created_at", ""))[:16]}
            for a in acts[:6]
            if isinstance(a, dict)
        ]
    prefs = snapshot.get("preferences")
    if isinstance(prefs, dict) and "default_platform" in prefs:
        out["preferences"] = {"default_platform": prefs.get("default_platform")}
    return json.dumps(out, ensure_ascii=True, indent=2)


def record_activity(db: Session, workspace_id: str, text_value: str) -> None:
    db.execute(
        text(
            "insert into flowpilot_activities (id, workspace_id, text, created_at) "
            "values (:id, :workspace_id, :text, now())"
        ),
        {"id": f"act-{uuid.uuid4().hex[:12]}", "workspace_id": workspace_id, "text": text_value},
    )


@dataclass
class WorkspacePublishPost:
    platform: str
    content: str
    media_url: str | None


def _valid_platforms(platforms: list[str]) -> list[str]:
    cleaned: list[str] = []
    for platform in platforms:
        value = platform.strip().lower()
        if value in {"linkedin", "instagram", "facebook"} and value not in cleaned:
            cleaned.append(value)
    return cleaned


def _workspace_content_row(db: Session, workspace_id: str, content_id: str) -> dict[str, Any] | None:
    row = db.execute(
        text("select * from flowpilot_content where workspace_id = :workspace_id and id = :content_id"),
        {"workspace_id": workspace_id, "content_id": content_id},
    ).mappings().first()
    return dict(row) if row is not None else None


def _insert_publishing_log(db: Session, workspace_id: str, content_id: str, platform: str, status: str) -> None:
    db.execute(
        text(
            "insert into flowpilot_publishing_log (id, workspace_id, content_id, platform, timestamp, status) "
            "values (:id, :workspace_id, :content_id, :platform, now(), :status)"
        ),
        {
            "id": f"pub-{uuid.uuid4().hex[:12]}",
            "workspace_id": workspace_id,
            "content_id": content_id,
            "platform": platform,
            "status": status,
        },
    )


def _set_integration(db: Session, workspace_id: str, platform: str, connected: bool, account_name: str, account_handle: str) -> None:
    db.execute(
        text(
            "insert into flowpilot_integrations (workspace_id, platform, connected, account_name, account_handle, updated_at) "
            "values (:workspace_id, :platform, :connected, :account_name, :account_handle, now()) "
            "on conflict (workspace_id, platform) do update set "
            "connected = excluded.connected, account_name = excluded.account_name, "
            "account_handle = excluded.account_handle, updated_at = now()"
        ),
        {
            "workspace_id": workspace_id,
            "platform": platform,
            "connected": connected,
            "account_name": account_name,
            "account_handle": account_handle,
        },
    )


def _default_platform(db: Session, workspace_id: str) -> str:
    row = db.execute(
        text("select default_platform from flowpilot_preferences where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    value = str(row["default_platform"]) if row else "linkedin"
    return value if value in {"linkedin", "instagram", "facebook"} else "linkedin"


def _activation_platform(db: Session, workspace_id: str, body: ContentLibraryRequest) -> str | None:
    if body.auto_activate is not True:
        return None
    raw = (body.selected_platform or "").strip()
    if raw:
        valid = _valid_platforms([raw])
        if valid:
            return valid[0]
    return _default_platform(db, workspace_id)


def _seed_demo_metrics(db: Session, workspace_id: str) -> None:
    engagement_exists = db.execute(
        text("select 1 from flowpilot_engagement_series where workspace_id = :workspace_id limit 1"),
        {"workspace_id": workspace_id},
    ).first()
    if engagement_exists is None:
        for position, (name, engagement, reach) in enumerate(
            [("Mon", 18, 420), ("Tue", 24, 530), ("Wed", 31, 680), ("Thu", 29, 610), ("Fri", 36, 760), ("Sat", 22, 480), ("Sun", 27, 540)]
        ):
            db.execute(
                text(
                    "insert into flowpilot_engagement_series (workspace_id, position, name, engagement, reach) "
                    "values (:workspace_id, :position, :name, :engagement, :reach)"
                ),
                {"workspace_id": workspace_id, "position": position, "name": name, "engagement": engagement, "reach": reach},
            )
    leads_exists = db.execute(
        text("select 1 from flowpilot_leads_growth where workspace_id = :workspace_id limit 1"),
        {"workspace_id": workspace_id},
    ).first()
    if leads_exists is None:
        for position, (name, leads) in enumerate([("Week 1", 4), ("Week 2", 7), ("Week 3", 11), ("Week 4", 16)]):
            db.execute(
                text("insert into flowpilot_leads_growth (workspace_id, position, name, leads) values (:workspace_id, :position, :name, :leads)"),
                {"workspace_id": workspace_id, "position": position, "name": name, "leads": leads},
            )


def _cloudinary_public_id_stem(file_name: str | None, *, prefix: str = "flowpilot") -> str:
    """Strip to a Cloudinary-safe public_id stem (alphanumeric, hyphen, underscore)."""
    raw = (file_name or "").strip()
    if raw:
        base = Path(raw).name
        stem = base.rsplit(".", 1)[0] if "." in base else base
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", stem).strip("_")
        if safe:
            return safe[:120]
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _upload_to_cloudinary(data_url: str, file_name: str | None) -> str:
    if not settings.cloudinary_cloud_name or not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
        raise HTTPException(status_code=400, detail="Cloudinary credentials are not configured")
    timestamp = str(int(time.time()))
    public_id = _cloudinary_public_id_stem(file_name)
    # Signed upload: every POST param except `file` and `api_key` must be included in the signature.
    params_to_sign = {
        "folder": settings.cloudinary_folder,
        "public_id": public_id,
        "timestamp": timestamp,
    }
    signature_payload = "&".join(f"{key}={params_to_sign[key]}" for key in sorted(params_to_sign))
    signature = hashlib.sha1(f"{signature_payload}{settings.cloudinary_api_secret}".encode()).hexdigest()
    try:
        response = requests.post(
            f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/auto/upload",
            data={
                **params_to_sign,
                "api_key": settings.cloudinary_api_key,
                "signature": signature,
                "file": data_url,
            },
            timeout=settings.request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        raise HTTPException(status_code=502, detail=f"Cloudinary upload failed: {detail}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Cloudinary returned invalid JSON") from exc

    secure_url = str(payload.get("secure_url", "")).strip()
    if not secure_url:
        raise HTTPException(status_code=502, detail="Cloudinary upload did not return a secure URL")
    return secure_url


def _try_upload_remote_to_cloudinary(source_url: str, *, public_id: str) -> str | None:
    """Re-host a remote https asset in Cloudinary. Returns secure_url or None on failure."""
    if not settings.cloudinary_cloud_name or not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
        return None
    if not source_url.startswith("https://") or source_url.startswith("https://res.cloudinary.com/"):
        return None
    timestamp = str(int(time.time()))
    params_to_sign: dict[str, str] = {
        "folder": settings.cloudinary_folder,
        "public_id": public_id,
        "timestamp": timestamp,
    }
    signature_payload = "&".join(f"{key}={params_to_sign[key]}" for key in sorted(params_to_sign))
    signature = hashlib.sha1(f"{signature_payload}{settings.cloudinary_api_secret}".encode()).hexdigest()
    try:
        response = requests.post(
            f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/auto/upload",
            data={
                **params_to_sign,
                "api_key": settings.cloudinary_api_key,
                "signature": signature,
                "file": source_url,
            },
            timeout=settings.request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        logger.warning("Cloudinary remote upload failed: %s", detail)
        return None
    except ValueError as exc:
        logger.warning("Cloudinary remote upload invalid JSON: %s", exc)
        return None

    secure_url = str(payload.get("secure_url", "")).strip()
    if not secure_url:
        return None
    return secure_url


def _cloudinary_public_id_from_delivery_url(url: str) -> tuple[str, str, str] | None:
    """Parse a res.cloudinary.com delivery URL → (cloud_name, resource_type, public_id)."""
    try:
        u = urlparse(url.strip())
        if (u.netloc or "").lower().split(":")[0] != "res.cloudinary.com":
            return None
        parts = [x for x in u.path.strip("/").split("/") if x]
        if len(parts) < 4 or parts[2] != "upload":
            return None
        cloud_name, resource_type = parts[0], parts[1]
        if resource_type not in ("image", "video", "raw"):
            return None
        rest = parts[3:]
        if rest and rest[0].startswith("v") and len(rest[0]) > 1 and rest[0][1:].isdigit():
            rest = rest[1:]
        if not rest:
            return None
        last = rest[-1]
        if "." in last:
            base, ext = last.rsplit(".", 1)
            if ext.isalnum() and 1 <= len(ext) <= 8:
                rest = rest[:-1] + [base]
        public_id = "/".join(rest)
        if not public_id or ".." in public_id:
            return None
        return cloud_name, resource_type, public_id
    except (ValueError, IndexError):
        return None


def _try_destroy_cloudinary_delivery_asset(media_url: str) -> None:
    """Remove the asset from Cloudinary when deleting a library row (best-effort)."""
    parsed = _cloudinary_public_id_from_delivery_url(media_url)
    if parsed is None:
        return
    cloud_name, resource_type, public_id = parsed
    if cloud_name != settings.cloudinary_cloud_name:
        logger.warning("Skipping Cloudinary destroy: URL cloud %r != CLOUDINARY_CLOUD_NAME", cloud_name)
        return
    if not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
        return
    timestamp = str(int(time.time()))
    params_to_sign = {"public_id": public_id, "timestamp": timestamp}
    signature_payload = "&".join(f"{k}={params_to_sign[k]}" for k in sorted(params_to_sign))
    signature = hashlib.sha1(f"{signature_payload}{settings.cloudinary_api_secret}".encode()).hexdigest()
    try:
        endpoint = f"https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/destroy"
        response = requests.post(
            endpoint,
            data={**params_to_sign, "api_key": settings.cloudinary_api_key, "signature": signature},
            timeout=settings.request_timeout_seconds,
        )
        if response.status_code >= 400:
            logger.warning("Cloudinary destroy failed (%s): %s", response.status_code, response.text[:400])
    except requests.RequestException as exc:
        logger.warning("Cloudinary destroy request failed: %s", exc)


MEDIA_PATH_SEG = "media-assets"
MEDIA_MAX_BYTES = 8 * 1024 * 1024
# Stored local library files are med-{12 hex}.{ext} (must match GET /media-assets/... handler).
_LOCAL_MEDIA_FILE_NAME_RE = re.compile(r"^med-[a-f0-9]{12}\.[\w.]+$", re.I)
_MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
}


def _data_url_to_bytes(data_url: str) -> tuple[bytes, str]:
    s = data_url.strip()
    if not s.startswith("data:"):
        raise ValueError("Invalid data URL")
    mat = re.match(r"^data:([^,;]+);base64,(.+)$", s, re.DOTALL)
    if not mat:
        raise ValueError("Expected base64 data URL")
    mime = mat.group(1).lower().strip()
    b64 = mat.group(2)
    if not b64:
        raise ValueError("Empty payload")
    raw = base64.b64decode(b64, validate=False)
    return raw, mime


def _extension_for_mime(mime: str) -> str:
    return _MIME_TO_EXT.get(mime) or (mimetypes.guess_extension(mime) or ".bin")


def _local_public_media_path(workspace_id: str, file_name: str) -> str:
    return f"/api/backend/{MEDIA_PATH_SEG}/{workspace_id}/{file_name}"


def _local_upload_api_response(media_url: str, media_type: str) -> dict[str, Any]:
    """Local storage: relative path in media_url (same as DB). Optional absolute URL for real deployments / curl."""
    out: dict[str, Any] = {"media_url": media_url, "media_type": media_type, "storage": "local"}
    base = settings.public_app_origin.rstrip("/")
    if base:
        out["media_url_absolute"] = f"{base}{media_url}"
    return out


def _validate_media_library_external_url(url: str, *, workspace_id: str | None = None) -> str:
    """Allow HTTPS Cloudinary delivery URLs or this app's proxied media-assets paths."""
    u = url.strip()
    if not u:
        raise HTTPException(status_code=400, detail="media_url is required")
    if u.startswith("http://"):
        u = "https://" + u[7:]
    if u.startswith("/api/backend/media-assets/"):
        if ".." in u or u.count("/api/backend/media-assets/") != 1:
            raise HTTPException(status_code=400, detail="Invalid media URL")
        u = u.split()[0]
        rest = u.removeprefix("/api/backend/media-assets/").lstrip("/")
        parts = [p for p in rest.split("/") if p]
        if len(parts) != 2:
            raise HTTPException(
                status_code=400,
                detail="App media URL must include the file name, e.g. /api/backend/media-assets/usr-…/med-….jpg",
            )
        ws, fname = parts[0], parts[1]
        if ".." in ws or "/" in ws or not fname or "/" in fname or ".." in fname:
            raise HTTPException(status_code=400, detail="Invalid media URL")
        if not _LOCAL_MEDIA_FILE_NAME_RE.match(fname):
            raise HTTPException(
                status_code=400,
                detail="Invalid local media file in URL (expected med- followed by 12 hex chars and an extension).",
            )
        if workspace_id is not None and ws != workspace_id:
            raise HTTPException(status_code=400, detail="That app media URL belongs to a different workspace.")
        return u
    try:
        parsed = urlparse(u)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid media URL") from exc
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Only https URLs or /api/backend/media-assets/… links are allowed")
    host = (parsed.netloc or "").lower().split(":")[0]
    if host != "res.cloudinary.com":
        raise HTTPException(
            status_code=400,
            detail="Only Cloudinary URLs (https://res.cloudinary.com/…) or app media-assets links can be added",
        )
    path_l = (parsed.path or "").lower()
    if "/image/upload/" not in path_l and "/video/upload/" not in path_l and "/raw/upload/" not in path_l:
        raise HTTPException(status_code=400, detail="Not a Cloudinary resource URL (expected …/image/upload/…, …/video/upload/…, etc.)")
    return u.split()[0]


def _try_unlink_local_media_file(media_url: str) -> None:
    if "media-assets" not in media_url:
        return
    try:
        idx = media_url.index("media-assets/") + len("media-assets/")
        rel = media_url[idx:].lstrip("/")
        if not rel or ".." in rel:
            return
        parts = rel.split("/")
        if len(parts) < 2:
            return
        workspace_id, file_name = parts[0], parts[1]
        if not file_name or "/" in file_name or ".." in file_name:
            return
        base = (user_media_dir() / workspace_id).resolve()
        path = (base / file_name).resolve()
        if not str(path).startswith(str(base)):
            return
        if path.is_file():
            path.unlink()
    except (OSError, ValueError) as exc:
        logger.warning("Could not remove local media file: %s", exc)


def _suggestion_ingest_cloudinary(
    db: Session,
    workspace_id: str,
    suggestion: dict[str, str],
) -> dict[str, str]:
    """Re-host suggest media on Cloudinary and add a media_library row (matches manual uploads)."""
    out = dict(suggestion)
    source = (out.get("media_preview") or "").strip()
    if not source:
        return out
    if source.startswith("https://res.cloudinary.com/"):
        return out
    if not (settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret):
        return out
    public_stem = f"ai-suggest-{uuid.uuid4().hex[:10]}"
    cdn: str | None = None
    try:
        if source.startswith("data:"):
            cdn = _upload_to_cloudinary(source, public_stem)
        elif source.startswith("https://"):
            cdn = _try_upload_remote_to_cloudinary(source, public_id=public_stem)
    except HTTPException as exc:
        logger.warning("AI suggest Cloudinary ingest failed: %s", exc.detail)
        return out
    if not cdn:
        return out
    out["media_preview"] = cdn
    mtype = str(out.get("media_type") or "Image")
    if mtype not in {"Image", "Video", "Carousel"}:
        mtype = "Image"
    if mtype == "Carousel":
        mtype = "Image"
    title_label = (out.get("title") or "Post").strip()[:120]
    db.execute(
        text(
            "insert into flowpilot_media_library (id, workspace_id, name, media_type, media_url, created_at) "
            "values (:id, :workspace_id, :name, :media_type, :media_url, now())"
        ),
        {
            "id": f"med-{uuid.uuid4().hex[:12]}",
            "workspace_id": workspace_id,
            "name": f"AI suggest: {title_label}",
            "media_type": mtype,
            "media_url": cdn,
        },
    )
    return out


def _column_types(db: Session, table: str) -> dict[str, str]:
    rows = db.execute(
        text(
            "select column_name, data_type from information_schema.columns "
            "where table_name = :table and table_schema not in ('pg_catalog', 'information_schema') "
            "order by case when table_schema = current_schema() then 0 else 1 end"
        ),
        {"table": table},
    ).mappings().all()
    return {str(row["column_name"]): str(row["data_type"]) for row in rows}


def _list_value(db: Session, table: str, column: str, values: list[str]) -> Any:
    column_type = _column_types(db, table).get(column, "")
    if column_type == "ARRAY":
        return values
    if column_type in {"json", "jsonb"}:
        return json.dumps(values)
    return ", ".join(values)


def _list_expr(db: Session, table: str, column: str, param: str) -> str:
    column_type = _column_types(db, table).get(column, "")
    if column_type in {"json", "jsonb"}:
        return f"cast(:{param} as {column_type})"
    return f":{param}"


def _strategy_research_blob(research: dict[str, Any]) -> str:
    """Persist Agent 1 / research payload per workspace (no cross-workspace reuse). Excludes generated posts."""
    payload = {
        "company_study": research.get("company_study"),
        "strategy": research.get("strategy"),
        "competitors": research.get("competitors"),
        "agent1_locked": research.get("agent1_locked"),
        "agent2_locked": research.get("agent2_locked"),
    }
    raw = json.dumps(payload, ensure_ascii=True)
    if len(raw) > 1_500_000:
        payload.pop("agent1_locked", None)
        raw = json.dumps(payload, ensure_ascii=True)
    return raw


def _workspace_strategy_locked_default(db: Session, workspace_id: str) -> bool:
    row = db.execute(
        text("select master_setup_json from flowpilot_workspace where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if not row or not str(row.get("master_setup_json") or "").strip():
        return True
    try:
        ms = json.loads(str(row["master_setup_json"]))
        eng = ms.get("strategy_engine") if isinstance(ms, dict) else {}
        if isinstance(eng, dict) and "locked" in eng:
            return bool(eng["locked"])
    except (json.JSONDecodeError, TypeError):
        pass
    return True


def _current_strategy_version(db: Session, workspace_id: str) -> int:
    row = db.execute(
        text("select strategy_version from flowpilot_strategy where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if row is None:
        return 1
    v = row.get("strategy_version")
    try:
        return max(1, int(v))
    except (TypeError, ValueError):
        return 1


def _next_strategy_version(db: Session, workspace_id: str) -> int:
    row = db.execute(
        text("select strategy_version from flowpilot_strategy where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if row is None:
        return 1
    v = row.get("strategy_version")
    try:
        return int(v) + 1
    except (TypeError, ValueError):
        return 2


def _insert_flowpilot_strategy(
    db: Session,
    *,
    workspace_id: str,
    strategy: dict[str, Any],
    research: dict[str, Any],
    strategy_version: int,
    strategy_locked: bool,
) -> None:
    cols = _column_types(db, "flowpilot_strategy")
    fields = ["workspace_id", "target_audience", "content_themes", "platform_focus", "market_gaps"]
    vals = [
        ":workspace_id",
        ":target_audience",
        _list_expr(db, "flowpilot_strategy", "content_themes", "content_themes"),
        _list_expr(db, "flowpilot_strategy", "platform_focus", "platform_focus"),
        _list_expr(db, "flowpilot_strategy", "market_gaps", "market_gaps"),
    ]
    params: dict[str, Any] = {
        "workspace_id": workspace_id,
        "target_audience": strategy["target_audience"],
        "content_themes": _list_value(db, "flowpilot_strategy", "content_themes", strategy["content_themes"]),
        "platform_focus": _list_value(db, "flowpilot_strategy", "platform_focus", strategy["platform_focus"]),
        "market_gaps": _list_value(db, "flowpilot_strategy", "market_gaps", strategy["market_gaps"]),
    }
    if "strategy_version" in cols:
        fields.append("strategy_version")
        vals.append(":strategy_version")
        params["strategy_version"] = max(1, int(strategy_version))
    if "strategy_locked" in cols:
        fields.append("strategy_locked")
        vals.append(":strategy_locked")
        params["strategy_locked"] = bool(strategy_locked)
    if "data_json" in cols:
        fields.append("data_json")
        vals.append(":data_json")
        params["data_json"] = _strategy_research_blob(research)
    if "updated_at" in cols:
        fields.append("updated_at")
        vals.append("now()")
    sql = f"insert into flowpilot_strategy ({', '.join(fields)}) values ({', '.join(vals)})"
    db.execute(text(sql), params)


def _insert_flowpilot_content_row(
    db: Session,
    *,
    new_id: str,
    workspace_id: str,
    title: str,
    content_text: str,
    media_type: str,
    media_preview: str,
    status: str,
    selected_platform: str | None,
    scheduled_at: Any,
    strategy_version: int | None = None,
) -> None:
    cols = _column_types(db, "flowpilot_content")
    fields = [
        "id",
        "workspace_id",
        "title",
        "content_text",
        "media_type",
        "media_preview",
        "status",
        "selected_platform",
        "scheduled_at",
    ]
    vals = [
        ":id",
        ":workspace_id",
        ":title",
        ":content_text",
        ":media_type",
        ":media_preview",
        ":status",
        ":selected_platform",
        ":scheduled_at",
    ]
    params: dict[str, Any] = {
        "id": new_id,
        "workspace_id": workspace_id,
        "title": title,
        "content_text": content_text,
        "media_type": media_type,
        "media_preview": media_preview,
        "status": status,
        "selected_platform": selected_platform,
        "scheduled_at": scheduled_at,
    }
    if "strategy_version" in cols:
        fields.append("strategy_version")
        vals.append(":strategy_version")
        sv = strategy_version if strategy_version is not None else _current_strategy_version(db, workspace_id)
        params["strategy_version"] = max(1, int(sv))
    sql = f"insert into flowpilot_content ({', '.join(fields)}) values ({', '.join(vals)})"
    db.execute(text(sql), params)


def _workspace_context(db: Session, workspace_id: str) -> dict[str, str]:
    row = db.execute(
        text(
            "select company_name, company_website, workspace_scenario, coalesce(nullif(trim(primary_region), ''), 'uae-india') as primary_region "
            "from flowpilot_workspace where workspace_id = :workspace_id"
        ),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if row is None:
        return {"company_name": "", "company_website": "", "workspace_scenario": "b2b-saas", "primary_region": "uae-india"}
    return {
        "company_name": str(row["company_name"] or ""),
        "company_website": str(row["company_website"] or ""),
        "workspace_scenario": str(row["workspace_scenario"] or "b2b-saas"),
        "primary_region": _normalize_primary_region(str(row.get("primary_region", "uae-india") or "uae-india")),
    }


def save_workspace_ai_flow(
    db: Session,
    *,
    workspace_id: str,
    company_name: str,
    website: str,
    scenario: str,
    competitors: list[dict[str, str]],
    ai_model: str | None,
    replace_content: bool,
    calendar_days: int = DEFAULT_WORKSPACE_CALENDAR_DAYS,
    primary_region: str = "uae-india",
) -> dict[str, Any]:
    research = generate_workspace_research(
        company_name=company_name,
        website=website,
        scenario=scenario,
        competitors=competitors,
        ai_model=ai_model,
        calendar_days=calendar_days,
        primary_region=_normalize_primary_region(primary_region),
    )
    ai_model_used = research.pop("_ai_model_used", None)
    ai_model_requested = research.pop("_ai_model_requested", None)
    ai_models_by_step = research.pop("_ai_models_by_step", None)
    strategy = research["strategy"]
    company_study = research.get("company_study", {})
    discovered_website = str(company_study.get("discovered_website", "")).strip()
    if not website and discovered_website:
        website = discovered_website
        db.execute(
            text("update flowpilot_workspace set company_website = :website, updated_at = now() where workspace_id = :workspace_id"),
            {"workspace_id": workspace_id, "website": website},
        )
    competitor_rows = research["competitors"]

    next_strategy_version = _next_strategy_version(db, workspace_id)
    strategy_locked_flag = _workspace_strategy_locked_default(db, workspace_id)

    db.execute(text("delete from flowpilot_strategy where workspace_id = :workspace_id"), {"workspace_id": workspace_id})
    db.execute(text("delete from flowpilot_competitors where workspace_id = :workspace_id"), {"workspace_id": workspace_id})

    _insert_flowpilot_strategy(
        db,
        workspace_id=workspace_id,
        strategy=strategy,
        research=research,
        strategy_version=next_strategy_version,
        strategy_locked=strategy_locked_flag,
    )

    comp_cols = _column_types(db, "flowpilot_competitors")
    has_extended = all(c in comp_cols for c in ("domain", "market_rank", "market_gap", "marketing_purpose"))

    for competitor in competitor_rows[:10]:
        base_params = {
            "id": f"cmp-{uuid.uuid4().hex[:12]}",
            "workspace_id": workspace_id,
            "name": competitor["name"],
            "positioning": competitor["positioning"],
            "strengths": _list_value(db, "flowpilot_competitors", "strengths", competitor["strengths"]),
            "weaknesses": _list_value(db, "flowpilot_competitors", "weaknesses", competitor["weaknesses"]),
        }
        if has_extended:
            base_params.update(
                {
                    "domain": str(competitor.get("domain", "") or "")[:500],
                    "market_rank": str(competitor.get("market_rank", "") or "")[:500],
                    "market_gap": str(competitor.get("market_gap", "") or "")[:2000],
                    "marketing_purpose": str(competitor.get("marketing_purpose", "") or "")[:2000],
                }
            )
            db.execute(
                text(
                    "insert into flowpilot_competitors "
                    "(id, workspace_id, name, domain, positioning, market_rank, market_gap, marketing_purpose, strengths, weaknesses) "
                    f"values (:id, :workspace_id, :name, :domain, :positioning, :market_rank, :market_gap, :marketing_purpose, "
                    f"{_list_expr(db, 'flowpilot_competitors', 'strengths', 'strengths')}, "
                    f"{_list_expr(db, 'flowpilot_competitors', 'weaknesses', 'weaknesses')})"
                ),
                base_params,
            )
        else:
            db.execute(
                text(
                    "insert into flowpilot_competitors "
                    "(id, workspace_id, name, positioning, strengths, weaknesses) "
                    f"values (:id, :workspace_id, :name, :positioning, {_list_expr(db, 'flowpilot_competitors', 'strengths', 'strengths')}, "
                    f"{_list_expr(db, 'flowpilot_competitors', 'weaknesses', 'weaknesses')})"
                ),
                base_params,
            )

    if replace_content:
        db.execute(text("delete from flowpilot_content where workspace_id = :workspace_id"), {"workspace_id": workspace_id})
        db.execute(
            text("delete from flowpilot_post_analytics where workspace_id = :workspace_id"),
            {"workspace_id": workspace_id},
        )
        for index, item in enumerate(research["content"][:90]):
            media_preview = item["media_preview"] or f"https://picsum.photos/seed/{workspace_id}-{index}/800/450"
            _insert_flowpilot_content_row(
                db,
                new_id=f"cnt-{uuid.uuid4().hex[:12]}",
                workspace_id=workspace_id,
                title=item["title"],
                content_text=item["content_text"],
                media_type=item["media_type"],
                media_preview=media_preview,
                status="PENDING",
                selected_platform=None,
                scheduled_at=None,
                strategy_version=next_strategy_version,
            )

    competitor_mode = "manual competitor inputs" if competitors else "automatic competitor discovery"
    model_label = ai_model_used or ai_model or settings.openrouter_model
    record_activity(
        db,
        workspace_id,
        f"Master workspace AI flow completed for {company_name} with {model_label}: Agent 1 finished website/domain research, competitor study, positioning, feature gaps, and strategy using {competitor_mode}; Agent 2 generated content from that strategy.",
    )
    scenario_summary = str(company_study.get("scenario_summary", "")).strip()
    if scenario_summary:
        record_activity(db, workspace_id, f"Company and scenario study: {scenario_summary}")
    for gap in strategy["market_gaps"][:5]:
        record_activity(db, workspace_id, f"Marketing gap issue found: {gap}")
    research["ai_model_used"] = ai_model_used
    research["ai_model_requested"] = ai_model_requested
    research["ai_models_by_step"] = ai_models_by_step
    research["strategy_version"] = next_strategy_version
    research["strategy_locked"] = strategy_locked_flag
    return research


def _db_text_array_to_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
            except (json.JSONDecodeError, TypeError):
                pass
            else:
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed if str(x).strip()]
        return [s]
    return []


def _strategy_output_bundle_from_db(db: Session, workspace_id: str) -> dict[str, Any] | None:
    """Rebuild the JSON shape used by the content agent from persisted strategy + competitors."""
    strategy_row = db.execute(
        text("select * from flowpilot_strategy where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if strategy_row is None:
        return None

    raw_competitors = db.execute(
        text(
            "select name, domain, positioning, market_rank, market_gap, marketing_purpose, strengths, weaknesses "
            "from flowpilot_competitors where workspace_id = :workspace_id order by name limit 10"
        ),
        {"workspace_id": workspace_id},
    ).mappings().all()

    themes = _db_text_array_to_list(strategy_row["content_themes"])
    platform_focus = _db_text_array_to_list(strategy_row["platform_focus"])
    market_gaps = _db_text_array_to_list(strategy_row["market_gaps"])

    competitors: list[dict[str, Any]] = []
    for row in raw_competitors:
        name = str(row["name"] or "").strip()
        if not name:
            continue
        strengths = _db_text_array_to_list(row["strengths"])
        weaknesses = _db_text_array_to_list(row["weaknesses"])
        if not weaknesses:
            weaknesses = ["Content differentiation opportunity"]
        mg = str(row.get("market_gap") or "").strip()
        if not mg and weaknesses:
            mg = weaknesses[0]
        competitors.append(
            {
                "name": name[:180],
                "domain": str(row.get("domain") or "").strip()[:300],
                "positioning": str(row.get("positioning") or "").strip() or "Market alternative to benchmark against.",
                "market_rank": str(row.get("market_rank") or "").strip() or "Qualitative estimate — validate in market",
                "market_gap": mg or "Differentiation opportunity vs. this player",
                "marketing_purpose": str(row.get("marketing_purpose") or "").strip()
                or "Grow category presence and win qualified demand",
                "strengths": strengths or ["Recognized market presence"],
                "weaknesses": weaknesses,
            }
        )

    gap_issues = market_gaps[:5] if market_gaps else ["Saved strategy gaps — refresh research for more detail."]

    bundle: dict[str, Any] = {
        "company_study": {
            "discovered_website": "",
            "scenario_summary": "",
            "marketing_gap_issues": gap_issues,
        },
        "strategy": {
            "target_audience": str(strategy_row["target_audience"] or "").strip(),
            "content_themes": themes or ["Proof-led education", "Customer pain point breakdowns"],
            "platform_focus": platform_focus or ["linkedin", "instagram", "facebook"],
            "market_gaps": market_gaps or gap_issues,
        },
        "competitors": competitors,
    }

    dj = strategy_row.get("data_json")
    if dj and str(dj).strip():
        try:
            blob = json.loads(str(dj))
        except (json.JSONDecodeError, TypeError):
            blob = None
        if isinstance(blob, dict):
            if isinstance(blob.get("company_study"), dict):
                bundle["company_study"] = {**bundle["company_study"], **blob["company_study"]}
            if blob.get("agent1_locked"):
                bundle["agent1_locked"] = blob["agent1_locked"]
            if blob.get("agent2_locked"):
                bundle["agent2_locked"] = blob["agent2_locked"]

    return bundle


def append_workspace_generated_content(
    db: Session,
    *,
    workspace_id: str,
    company_name: str,
    website: str,
    scenario: str,
    ai_model: str | None,
    calendar_days: int,
    primary_region: str,
) -> str:
    """Returns OpenRouter model id that completed content generation (after fallback)."""
    bundle = _strategy_output_bundle_from_db(db, workspace_id)
    if bundle is None:
        raise ValueError("missing_strategy")

    competitors_for_agent: list[dict[str, str]] = []
    for c in bundle.get("competitors", []):
        if not isinstance(c, dict):
            continue
        n = str(c.get("name", "")).strip()
        if not n:
            continue
        competitors_for_agent.append(
            {
                "name": n,
                "website": str(c.get("domain", "") or "")[:500],
                "focus": (str(c.get("positioning", "") or "") or str(c.get("market_gap", "") or ""))[:500],
            }
        )

    strategy_output: dict[str, Any] = {**bundle, "content": []}

    content_rows, used_model, _content_extras = run_workspace_content_agent(
        company_name=company_name,
        website=website,
        scenario=scenario,
        competitors=competitors_for_agent,
        strategy_output=strategy_output,
        ai_model=ai_model,
        calendar_days=calendar_days,
        primary_region=_normalize_primary_region(primary_region),
    )

    for index, item in enumerate(content_rows[:90]):
        media_preview = item.get("media_preview") or f"https://picsum.photos/seed/{workspace_id}-{uuid.uuid4().hex[:8]}-{index}/800/450"
        _insert_flowpilot_content_row(
            db,
            new_id=f"cnt-{uuid.uuid4().hex[:12]}",
            workspace_id=workspace_id,
            title=item["title"],
            content_text=item["content_text"],
            media_type=item["media_type"],
            media_preview=media_preview,
            status="PENDING",
            selected_platform=None,
            scheduled_at=None,
            strategy_version=_current_strategy_version(db, workspace_id),
        )

    model_label = used_model or ai_model or settings.openrouter_model
    record_activity(
        db,
        workspace_id,
        f"New content posts added with {model_label} using your saved strategy and competitor research; existing library items and prior research outputs were kept.",
    )
    return used_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Uvicorn --reload (especially on Windows) can leave a half-reloaded app missing some
    # @app.* routes while others still register; re-bind idempotently on every startup.
    _bind_media_routes_if_missing()
    user_media_dir().mkdir(parents=True, exist_ok=True)
    init_db()
    stop_event = asyncio.Event()
    scheduler_task = asyncio.create_task(scheduler_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="AI Marketing Automation Backend",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, Any]:
    """Base URL: opening http://127.0.0.1:8011/ in a browser is expected to hit this, not 404."""
    return {
        "service": "FlowPilot API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
        "note": "App routes are under /workspace, /content, /strategy, etc. (not /).",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.head("/health")
def health_head() -> Response:
    # wait-on and some clients probe with HEAD; GET-only would return 405.
    return Response()


@app.get("/openrouter/balance")
def openrouter_balance(
    _user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Exposes OpenRouter /api/v1/key balance for the server's API key (USD credits).
    All models in the app draw from the same key; there is no per-model quota in this API.
    """
    return get_openrouter_key_info_for_ui()


def serve_local_media_file(workspace_id: str, file_name: str) -> FileResponse:
    if (
        ".." in workspace_id
        or "/" in workspace_id
        or not file_name
        or "/" in file_name
        or ".." in file_name
        or not _LOCAL_MEDIA_FILE_NAME_RE.match(file_name)
    ):
        raise HTTPException(status_code=404, detail="Not found")
    base = (user_media_dir() / workspace_id).resolve()
    root = user_media_dir().resolve()
    if not str(base).startswith(str(root)):
        raise HTTPException(status_code=404, detail="Not found")
    path = (base / file_name).resolve()
    if not str(path).startswith(str(base)) or not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    media_type, _ = mimetypes.guess_type(file_name)
    return FileResponse(
        str(path),
        media_type=media_type or "application/octet-stream",
        filename=file_name,
    )


@app.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = body.email.strip().lower()
    name = body.name.strip()
    password = body.password

    existing = db.execute(
        text("select id from flowpilot_users where lower(email) = :email"),
        {"email": email},
    ).mappings().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Account already exists. Please log in.")

    user_id = f"usr-{uuid.uuid4().hex[:10]}"
    db.execute(
        text(
            "insert into flowpilot_users (id, name, email, password, created_at) "
            "values (:id, :name, :email, :password, now())"
        ),
        {"id": user_id, "name": name, "email": email, "password": password},
    )
    db.commit()

    user = AuthUserResponse(name=name, email=email)
    return AuthResponse(token=auth_token(user_id), user=user)


@app.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    row = db.execute(
        text(
            "select id, name, email from flowpilot_users "
            "where lower(email) = :email and password = :password"
        ),
        {"email": body.email.strip().lower(), "password": body.password},
    ).mappings().first()

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return AuthResponse(token=auth_token(str(row["id"])), user=serialize_auth_user(dict(row)))


@app.get("/workspace")
def get_workspace(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    return workspace_snapshot(db, str(user["id"]), user)


@app.post("/workspace/search")
def workspace_search(
    body: WorkspaceSearchRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    snapshot = workspace_snapshot(db, workspace_id, user)
    if not snapshot.get("workspace_configured"):
        raise HTTPException(status_code=400, detail="Complete workspace setup before using AI search.")
    ctx = _compact_workspace_for_search(snapshot)
    primary_region = str(snapshot.get("primary_region") or "uae-india")
    try:
        answer, used_model = run_workspace_search_agent(
            workspace_context_json=ctx,
            query=body.query.strip(),
            primary_region=primary_region,
            ai_model=body.ai_model,
        )
    except AgentError as exc:
        status, detail = _http_for_agent_error(exc)
        raise HTTPException(status_code=status, detail=detail) from exc
    return {
        "answer": answer,
        "ai_model_used": used_model,
        "ai_model_requested": body.ai_model,
    }


@app.delete("/workspace")
def delete_workspace(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    for table in (
        "flowpilot_post_analytics",
        "flowpilot_strategy",
        "flowpilot_competitors",
        "flowpilot_content",
        "flowpilot_leads",
        "flowpilot_activities",
        "flowpilot_publishing_log",
        "flowpilot_integrations",
        "flowpilot_profile",
        "flowpilot_preferences",
        "flowpilot_campaigns",
        "flowpilot_engagement_series",
        "flowpilot_leads_growth",
        "flowpilot_workspace",
    ):
        db.execute(text(f"delete from {table} where workspace_id = :workspace_id"), {"workspace_id": workspace_id})
    db.commit()
    return default_workspace_snapshot(user)


@app.post("/workspace/clear-ai")
def clear_workspace_ai_outputs(
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Remove strategy, competitors, and content so you can rerun Agent 1 / Agent 2 without wiping workspace profile."""
    workspace_id = str(user["id"])
    for table in ("flowpilot_post_analytics", "flowpilot_strategy", "flowpilot_competitors", "flowpilot_content"):
        db.execute(text(f"delete from {table} where workspace_id = :workspace_id"), {"workspace_id": workspace_id})
    record_activity(db, workspace_id, "Cleared AI strategy, competitor research, and content library.")
    db.commit()
    return workspace_snapshot(db, workspace_id, user)


@app.post("/workspace")
def setup_workspace(
    body: WorkspaceRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    scenario = body.scenario.strip() or "b2b-saas"
    company_name = body.company_name.strip()
    website = body.website.strip()
    primary_region = _normalize_primary_region(body.primary_region)
    owner_name = body.workspace_owner_name.strip() or str(user["name"])
    owner_email = body.workspace_owner_email.strip().lower() or str(user["email"])
    profile_tz = _default_timezone_for_region(primary_region)

    db.execute(
        text(
            "insert into flowpilot_workspace "
            "(workspace_id, company_name, company_website, workspace_scenario, primary_region, workspace_configured, crm_last_bulk_status, updated_at) "
            "values (:workspace_id, :company_name, :company_website, :workspace_scenario, :primary_region, true, 'Pending', now()) "
            "on conflict (workspace_id) do update set "
            "company_name = excluded.company_name, "
            "company_website = excluded.company_website, "
            "workspace_scenario = excluded.workspace_scenario, "
            "primary_region = excluded.primary_region, "
            "workspace_configured = true, "
            "updated_at = now()"
        ),
        {
            "workspace_id": workspace_id,
            "company_name": company_name,
            "company_website": website,
            "workspace_scenario": scenario,
            "primary_region": primary_region,
        },
    )
    db.execute(
        text(
            "insert into flowpilot_profile (workspace_id, name, email, company, timezone, updated_at) "
            "values (:workspace_id, :name, :email, :company, :timezone, now()) "
            "on conflict (workspace_id) do update set "
            "name = excluded.name, email = excluded.email, company = excluded.company, "
            "timezone = excluded.timezone, updated_at = now()"
        ),
        {
            "workspace_id": workspace_id,
            "name": owner_name,
            "email": owner_email,
            "company": company_name,
            "timezone": profile_tz,
        },
    )
    db.execute(
        text(
            "insert into flowpilot_preferences (workspace_id, default_platform, quiet_hours_enabled, approval_digest, updated_at) "
            "values (:workspace_id, 'linkedin', true, 'daily', now()) "
            "on conflict (workspace_id) do nothing"
        ),
        {"workspace_id": workspace_id},
    )
    _seed_demo_metrics(db, workspace_id)
    db.commit()

    competitor_inputs = normalize_competitor_inputs(body.competitors)
    master_setup, _master_setup_model = run_workspace_setup_master(
        workspace_id=workspace_id,
        company_name=company_name,
        website=website,
        scenario=scenario,
        competitors=competitor_inputs,
        primary_region=primary_region,
        ai_model=body.ai_model,
    )
    db.execute(
        text(
            "update flowpilot_workspace set master_setup_json = :j, updated_at = now() "
            "where workspace_id = :workspace_id"
        ),
        {"j": json.dumps(master_setup, ensure_ascii=True), "workspace_id": workspace_id},
    )
    db.commit()

    try:
        save_workspace_ai_flow(
            db,
            workspace_id=workspace_id,
            company_name=company_name,
            website=website,
            scenario=scenario,
            competitors=competitor_inputs,
            ai_model=body.ai_model,
            replace_content=True,
            calendar_days=DEFAULT_WORKSPACE_CALENDAR_DAYS,
            primary_region=primary_region,
        )
        db.commit()
    except Exception:
        logger.exception("Workspace AI flow failed")
        db.rollback()
        try:
            record_activity(db, workspace_id, "AI flow could not complete automatically. Check AI configuration and rerun competitor research.")
            db.commit()
        except Exception:
            db.rollback()

    return workspace_snapshot(db, workspace_id, user)


@app.post("/strategy")
def strategy(
    body: StrategyRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    context = _workspace_context(db, workspace_id)
    company_name = body.company_name.strip() or context["company_name"]
    website = body.website.strip() or context["company_website"]
    scenario = body.scenario.strip() or context["workspace_scenario"]
    if not company_name:
        raise HTTPException(status_code=400, detail="Company name is required before strategy research")

    try:
        research = save_workspace_ai_flow(
            db,
            workspace_id=workspace_id,
            company_name=company_name,
            website=website,
            scenario=scenario,
            competitors=normalize_competitor_inputs(body.competitors),
            ai_model=body.ai_model,
            replace_content=False,
            calendar_days=DEFAULT_WORKSPACE_CALENDAR_DAYS,
            primary_region=context["primary_region"],
        )
        db.commit()
    except AgentError as exc:
        db.rollback()
        logger.exception("Strategy research failed")
        status, detail = _http_for_agent_error(exc)
        raise HTTPException(status_code=status, detail=detail) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Strategy research failed")
        raise HTTPException(status_code=500, detail="Strategy research failed") from exc

    return {
        "strategy": research["strategy"],
        "competitors": research["competitors"],
        "ai_model_used": research.get("ai_model_used"),
        "ai_model_requested": body.ai_model,
        "ai_models_by_step": research.get("ai_models_by_step"),
    }


@app.post("/content")
def workspace_content(
    body: ContentLibraryRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    created_content_id: str | None = None
    ai_model_used_for_response: str | None = None
    if body.action == "generate":
        context = _workspace_context(db, workspace_id)
        has_strategy = (
            db.execute(
                text("select 1 from flowpilot_strategy where workspace_id = :workspace_id limit 1"),
                {"workspace_id": workspace_id},
            ).first()
            is not None
        )
        try:
            if has_strategy:
                ai_model_used_for_response = append_workspace_generated_content(
                    db,
                    workspace_id=workspace_id,
                    company_name=context["company_name"],
                    website=context["company_website"],
                    scenario=context["workspace_scenario"],
                    ai_model=body.ai_model,
                    calendar_days=body.calendar_days
                    if body.calendar_days is not None
                    else DEFAULT_WORKSPACE_CALENDAR_DAYS,
                    primary_region=context["primary_region"],
                )
            else:
                research = save_workspace_ai_flow(
                    db,
                    workspace_id=workspace_id,
                    company_name=context["company_name"],
                    website=context["company_website"],
                    scenario=context["workspace_scenario"],
                    competitors=[],
                    ai_model=body.ai_model,
                    replace_content=True,
                    calendar_days=body.calendar_days
                    if body.calendar_days is not None
                    else DEFAULT_WORKSPACE_CALENDAR_DAYS,
                    primary_region=context["primary_region"],
                )
                ai_model_used_for_response = research.get("ai_model_used")
            db.commit()
        except AgentError as exc:
            db.rollback()
            logger.exception("Content generation failed")
            status, detail = _http_for_agent_error(exc)
            raise HTTPException(status_code=status, detail=detail) from exc
        except Exception as exc:
            db.rollback()
            logger.exception("Content generation failed")
            raise HTTPException(status_code=500, detail="Content generation failed") from exc
    elif body.action == "suggest":
        context = _workspace_context(db, workspace_id)
        if not (context.get("company_name") or "").strip():
            raise HTTPException(
                status_code=400,
                detail="Add your company name in your profile or workspace before using AI suggest.",
            )
        strategy_row = db.execute(
            text(
                "select target_audience, content_themes, platform_focus, market_gaps from flowpilot_strategy "
                "where workspace_id = :workspace_id"
            ),
            {"workspace_id": workspace_id},
        ).mappings().first()
        strategy_snapshot: dict[str, Any] | None = dict(strategy_row) if strategy_row is not None else None
        competitor_rows = db.execute(
            text(
                "select name, positioning from flowpilot_competitors where workspace_id = :workspace_id order by name limit 10"
            ),
            {"workspace_id": workspace_id},
        ).mappings().all()
        competitors = [
            {"name": str(r["name"]), "website": "", "focus": str(r["positioning"] or "")} for r in competitor_rows
        ]
        try:
            suggestion, model_used = suggest_master_content_post(
                company_name=str(context["company_name"]),
                website=str(context["company_website"] or ""),
                scenario=str(context["workspace_scenario"] or "b2b-saas"),
                competitors=competitors,
                strategy_snapshot=strategy_snapshot,
                hint=(body.suggest_hint or "").strip(),
                ai_model=body.ai_model,
                workspace_id=workspace_id,
                primary_region=context["primary_region"],
                default_platform=_default_platform(db, workspace_id),
            )
        except AgentError as exc:
            status, detail = _http_for_agent_error(exc)
            raise HTTPException(status_code=status, detail=detail) from exc
        suggestion = _suggestion_ingest_cloudinary(db, workspace_id, suggestion)
        model_label = model_used
        record_activity(
            db,
            workspace_id,
            f"AI suggested a Master content draft using {model_label}.",
        )
        db.commit()
        return {
            "suggestion": suggestion,
            "content": workspace_snapshot(db, workspace_id, user)["content"],
            "ai_model_used": model_used,
            "ai_model_requested": body.ai_model,
        }
    elif body.action == "create":
        activation_platform = _activation_platform(db, workspace_id, body)
        auto_on = body.auto_activate is True
        status = "SCHEDULED" if auto_on and body.scheduled_at else "APPROVED" if auto_on else "PENDING"
        new_id = f"cnt-{uuid.uuid4().hex[:12]}"
        created_content_id = new_id
        _insert_flowpilot_content_row(
            db,
            new_id=new_id,
            workspace_id=workspace_id,
            title=(body.title or "Untitled content").strip(),
            content_text=(body.content_text or "").strip(),
            media_type=body.media_type or "Image",
            media_preview=body.media_preview or f"https://picsum.photos/seed/{workspace_id}-{uuid.uuid4().hex[:6]}/800/450",
            status=status,
            selected_platform=activation_platform,
            scheduled_at=body.scheduled_at,
            strategy_version=_current_strategy_version(db, workspace_id),
        )
        record_activity(db, workspace_id, "AI flow added a new content draft to the library.")
        db.commit()
    elif body.action == "update":
        if not body.content_id:
            raise HTTPException(status_code=400, detail="content_id is required")
        activation_platform = _activation_platform(db, workspace_id, body)
        auto_on = body.auto_activate is True
        status = "SCHEDULED" if auto_on and body.scheduled_at else "APPROVED" if auto_on else "PENDING"
        scheduled_sql = (
            "scheduled_at = :scheduled_at"
            if "scheduled_at" in body.model_fields_set
            else "scheduled_at = scheduled_at"
        )
        db.execute(
            text(
                "update flowpilot_content set "
                "title = coalesce(:title, title), "
                "content_text = coalesce(:content_text, content_text), "
                "media_type = coalesce(:media_type, media_type), "
                "media_preview = coalesce(:media_preview, media_preview), "
                f"{scheduled_sql}, "
                "selected_platform = coalesce(:selected_platform, selected_platform), "
                "status = :status, "
                "updated_at = now() "
                "where workspace_id = :workspace_id and id = :content_id"
            ),
            {
                "workspace_id": workspace_id,
                "content_id": body.content_id,
                "title": body.title,
                "content_text": body.content_text,
                "media_type": body.media_type,
                "media_preview": body.media_preview,
                "scheduled_at": body.scheduled_at,
                "selected_platform": activation_platform,
                "status": status,
            },
        )
        record_activity(db, workspace_id, "Content draft updated and returned to the AI review queue.")
        db.commit()
    elif body.action == "delete":
        if not body.content_id:
            raise HTTPException(status_code=400, detail="content_id is required")
        row = _workspace_content_row(db, workspace_id, body.content_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Content not found")
        db.execute(
            text("delete from flowpilot_post_analytics where workspace_id = :workspace_id and content_id = :content_id"),
            {"workspace_id": workspace_id, "content_id": body.content_id},
        )
        db.execute(
            text("delete from flowpilot_publishing_log where workspace_id = :workspace_id and content_id = :content_id"),
            {"workspace_id": workspace_id, "content_id": body.content_id},
        )
        db.execute(
            text("delete from flowpilot_content where workspace_id = :workspace_id and id = :content_id"),
            {"workspace_id": workspace_id, "content_id": body.content_id},
        )
        record_activity(db, workspace_id, "A content draft was removed from the library.")
        db.commit()
    else:
        raise HTTPException(status_code=400, detail="Unsupported content action")

    out: dict[str, Any] = {"content": workspace_snapshot(db, workspace_id, user)["content"]}
    if created_content_id:
        out["created_content_id"] = created_content_id
    if ai_model_used_for_response:
        out["ai_model_used"] = ai_model_used_for_response
        out["ai_model_requested"] = body.ai_model
    return out


@app.post("/approve")
def approve_workspace_content(
    body: WorkspaceApproveRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    selected_platforms = _valid_platforms(body.platforms or ([body.platform] if body.platform else []))
    if not selected_platforms:
        raise HTTPException(status_code=400, detail="At least one supported platform is required")

    row = _workspace_content_row(db, workspace_id, body.content_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Content not found")

    first_platform = selected_platforms[0]
    next_status = "SCHEDULED" if row.get("scheduled_at") else "APPROVED"
    db.execute(
        text(
            "update flowpilot_content set status = :status, selected_platform = :platform, updated_at = now() "
            "where workspace_id = :workspace_id and id = :content_id"
        ),
        {"workspace_id": workspace_id, "content_id": body.content_id, "status": next_status, "platform": first_platform},
    )

    clone_strategy_version: int | None = None
    raw_sv = row.get("strategy_version")
    if raw_sv is not None:
        try:
            clone_strategy_version = int(raw_sv)
        except (TypeError, ValueError):
            clone_strategy_version = None

    for platform in selected_platforms[1:]:
        clone_id = f"cnt-{uuid.uuid4().hex[:12]}"
        _insert_flowpilot_content_row(
            db,
            new_id=clone_id,
            workspace_id=workspace_id,
            title=str(row["title"]),
            content_text=str(row["content_text"]),
            media_type=str(row["media_type"]),
            media_preview=str(row["media_preview"]),
            status=next_status,
            selected_platform=platform,
            scheduled_at=row.get("scheduled_at"),
            strategy_version=clone_strategy_version,
        )

    record_activity(db, workspace_id, f"Review step approved content for {', '.join(selected_platforms)}.")
    db.commit()
    return {"content": workspace_snapshot(db, workspace_id, user)["content"]}


@app.post("/reject")
def reject_workspace_content(
    body: WorkspaceContentIdRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    db.execute(
        text("update flowpilot_content set status = 'REJECTED', updated_at = now() where workspace_id = :workspace_id and id = :content_id"),
        {"workspace_id": workspace_id, "content_id": body.content_id},
    )
    record_activity(db, workspace_id, "Review step rejected a content draft.")
    db.commit()
    return {"content": workspace_snapshot(db, workspace_id, user)["content"]}


@app.post("/schedule")
def schedule_workspace_content(
    body: WorkspaceScheduleRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    db.execute(
        text(
            "update flowpilot_content set scheduled_at = :scheduled_at, "
            "status = case when status = 'PUBLISHED' then status else 'SCHEDULED' end, "
            "updated_at = now() "
            "where workspace_id = :workspace_id and id = :content_id"
        ),
        {"workspace_id": workspace_id, "content_id": body.content_id, "scheduled_at": body.scheduled_at},
    )
    record_activity(db, workspace_id, f"Smart scheduling set a publishing slot for {body.scheduled_at.isoformat()}.")
    db.commit()
    return {"content": workspace_snapshot(db, workspace_id, user)["content"]}


@app.get("/schedule")
def get_workspace_schedule(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    scheduled = [
        dict(row)
        for row in db.execute(
            text(
                "select id as content_id, title, scheduled_at, selected_platform as platform, status "
                "from flowpilot_content where workspace_id = :workspace_id and scheduled_at is not null order by scheduled_at"
            ),
            {"workspace_id": workspace_id},
        ).mappings().all()
    ]
    return {"scheduled": scheduled}


@app.post("/publish")
def publish_workspace_content(
    body: WorkspacePublishRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    published_count = 0
    warnings: list[str] = []
    for content_id in body.content_ids[:50]:
        row = _workspace_content_row(db, workspace_id, content_id)
        if row is None:
            warnings.append(f"Content {content_id} was not found")
            continue
        platform = str(row.get("selected_platform") or "").lower()
        if platform not in {"linkedin", "instagram", "facebook"}:
            warnings.append(f"{row['title']} has no supported platform selected")
            continue
        mp = str(row.get("media_preview") or "").strip()
        post = WorkspacePublishPost(platform=platform, content=str(row["content_text"]), media_url=mp or None)
        result = publish_post(post)  # type: ignore[arg-type]
        if result.success:
            published_count += 1
            db.execute(
                text("update flowpilot_content set status = 'PUBLISHED', updated_at = now() where workspace_id = :workspace_id and id = :content_id"),
                {"workspace_id": workspace_id, "content_id": content_id},
            )
            _insert_publishing_log(db, workspace_id, content_id, platform, "Success")
        else:
            warnings.append(f"{row['title']}: {result.message}")
            _insert_publishing_log(db, workspace_id, content_id, platform, "Failed")
    record_activity(db, workspace_id, f"Publish step completed: {published_count} item(s) published.")
    db.commit()
    snapshot = workspace_snapshot(db, workspace_id, user)
    return {
        "content": snapshot["content"],
        "leads": snapshot["leads"],
        "publishing_log": snapshot["publishing_log"],
        "published_count": published_count,
        "warnings": warnings,
    }


@app.post("/cron/run")
def run_workspace_cron(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    due_ids = [
        str(row["id"])
        for row in db.execute(
            text(
                "select id from flowpilot_content where workspace_id = :workspace_id "
                "and status = 'SCHEDULED' and scheduled_at is not null and scheduled_at <= now() order by scheduled_at"
            ),
            {"workspace_id": workspace_id},
        ).mappings().all()
    ]
    result = publish_workspace_content(WorkspacePublishRequest(content_ids=due_ids), db, user)
    return {"published_count": result["published_count"], "warnings": result["warnings"]}


@app.post("/connect/linkedin")
def connect_linkedin(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    s = fresh_settings()
    connected = bool(s.linkedin_access_token and s.linkedin_author_urn)
    _set_integration(db, workspace_id, "linkedin", connected, "LinkedIn Workspace", s.linkedin_author_urn or "not-configured")
    record_activity(db, workspace_id, "LinkedIn integration checked and saved.")
    db.commit()
    return {"integrations": workspace_snapshot(db, workspace_id, user)["integrations"]}


@app.post("/connect/meta")
def connect_meta(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    s = fresh_settings()
    connected = bool(s.meta_page_access_token and (s.meta_page_id or s.meta_ig_business_account_id))
    handle = s.meta_page_id or s.meta_ig_business_account_id or "not-configured"
    _set_integration(db, workspace_id, "meta", connected, "Meta Workspace", handle)
    record_activity(db, workspace_id, "Meta integration checked and saved.")
    db.commit()
    return {"integrations": workspace_snapshot(db, workspace_id, user)["integrations"]}


@app.get("/profile")
def get_profile(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    return {"profile": workspace_snapshot(db, workspace_id, user)["profile"]}


@app.post("/profile")
def update_profile(body: ProfileRequest, db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    current = workspace_snapshot(db, workspace_id, user)["profile"]
    db.execute(
        text(
            "insert into flowpilot_profile (workspace_id, name, email, company, timezone, updated_at) "
            "values (:workspace_id, :name, :email, :company, :timezone, now()) "
            "on conflict (workspace_id) do update set "
            "name = excluded.name, email = excluded.email, company = excluded.company, timezone = excluded.timezone, updated_at = now()"
        ),
        {
            "workspace_id": workspace_id,
            "name": body.name if body.name is not None else current["name"],
            "email": body.email if body.email is not None else current["email"],
            "company": body.company if body.company is not None else current["company"],
            "timezone": body.timezone if body.timezone is not None else current["timezone"],
        },
    )
    db.commit()
    return {"profile": workspace_snapshot(db, workspace_id, user)["profile"]}


@app.post("/preferences")
def update_preferences(body: PreferencesRequest, db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    current = workspace_snapshot(db, workspace_id, user)["preferences"]
    default_platform = body.default_platform if body.default_platform in {"linkedin", "instagram", "facebook"} else current["default_platform"]
    approval_digest = body.approval_digest if body.approval_digest in {"instant", "daily"} else current["approval_digest"]
    quiet_hours = body.quiet_hours_enabled if body.quiet_hours_enabled is not None else current["quiet_hours_enabled"]
    db.execute(
        text(
            "insert into flowpilot_preferences (workspace_id, default_platform, quiet_hours_enabled, approval_digest, updated_at) "
            "values (:workspace_id, :default_platform, :quiet_hours_enabled, :approval_digest, now()) "
            "on conflict (workspace_id) do update set "
            "default_platform = excluded.default_platform, quiet_hours_enabled = excluded.quiet_hours_enabled, "
            "approval_digest = excluded.approval_digest, updated_at = now()"
        ),
        {
            "workspace_id": workspace_id,
            "default_platform": default_platform,
            "quiet_hours_enabled": quiet_hours,
            "approval_digest": approval_digest,
        },
    )
    db.commit()
    return {"preferences": workspace_snapshot(db, workspace_id, user)["preferences"]}


def upload_cloudinary_media(body: MediaUploadRequest, db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    media_url = _upload_to_cloudinary(body.data_url, body.file_name)
    media_type = body.media_type if body.media_type in {"Image", "Video", "Carousel"} else "Image"
    db.execute(
        text(
            "insert into flowpilot_media_library (id, workspace_id, name, media_type, media_url, created_at) "
            "values (:id, :workspace_id, :name, :media_type, :media_url, now())"
        ),
        {
            "id": f"med-{uuid.uuid4().hex[:12]}",
            "workspace_id": workspace_id,
            "name": body.file_name or "Uploaded media",
            "media_type": media_type,
            "media_url": media_url,
        },
    )
    record_activity(db, workspace_id, "Media setup uploaded an asset to Cloudinary.")
    db.commit()
    return {"media_url": media_url, "media_type": media_type, "folder": settings.cloudinary_folder}


def _normalize_form_media_type(value: str | None) -> str | None:
    if not value:
        return None
    s = str(value).strip()
    low = s.lower()
    if low in {"image", "video", "carousel"}:
        return low.title() if low != "carousel" else "Carousel"
    if s in {"Image", "Video", "Carousel"}:
        return s
    return None


def _store_local_media_bytes(
    workspace_id: str,
    raw: bytes,
    mime: str,
    *,
    display_name: str | None,
    declared_media_type: str | None,
    db: Session,
) -> dict[str, Any]:
    if len(raw) > MEDIA_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large (max {MEDIA_MAX_BYTES // (1024 * 1024)}MB)")

    ext = _extension_for_mime(mime)
    if ext == ".bin" and mime.startswith("image/"):
        ext = ".jpg"
    is_video = mime.startswith("video/")
    mt = declared_media_type
    if mt in {"Image", "Video", "Carousel"}:
        media_type = "Video" if (mt == "Video" or is_video) else mt
    else:
        media_type = "Video" if is_video else "Image"
    if media_type == "Carousel" and is_video:
        media_type = "Video"

    asset_id = f"med-{uuid.uuid4().hex[:12]}"
    file_name = f"{asset_id}{ext}"

    dest_dir = user_media_dir() / workspace_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / file_name
    dest.write_bytes(raw)

    media_url = _local_public_media_path(workspace_id, file_name)
    label = (display_name or "").strip() or "Uploaded media"
    db.execute(
        text(
            "insert into flowpilot_media_library (id, workspace_id, name, media_type, media_url, created_at) "
            "values (:id, :workspace_id, :name, :media_type, :media_url, now())"
        ),
        {
            "id": asset_id,
            "workspace_id": workspace_id,
            "name": label[:300],
            "media_type": media_type,
            "media_url": media_url,
        },
    )
    record_activity(db, workspace_id, "Media setup uploaded an asset to local media library.")
    db.commit()
    return _local_upload_api_response(media_url, media_type)


async def upload_local_media(request: Request, db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Store upload on disk. Accepts JSON {data_url, file_name, media_type} or multipart (file or data_url part + optional file_name, media_type)."""
    workspace_id = str(user["id"])
    ct = (request.headers.get("content-type") or "").lower()

    if ct.startswith("application/json"):
        body = MediaUploadRequest.model_validate(await request.json())
        try:
            raw, mime = _data_url_to_bytes(body.data_url)
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid upload: {exc}") from exc
        return _store_local_media_bytes(
            workspace_id,
            raw,
            mime,
            display_name=body.file_name,
            declared_media_type=body.media_type,
            db=db,
        )

    if ct.startswith("multipart/form-data"):
        form = await request.form()
        upload: UploadFile | None = None
        for key in ("file", "data_url"):
            if key in form and isinstance(form[key], UploadFile):
                upload = form[key]
                break
        if upload is None:
            raise HTTPException(
                status_code=400,
                detail="multipart: include a file part named 'file' or 'data_url' (raw bytes), plus optional file_name and media_type fields.",
            )
        raw = await upload.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty file upload")
        mime = (upload.content_type or "").strip().lower()
        if not mime or mime == "application/octet-stream":
            guessed, _ = mimetypes.guess_type(upload.filename or "")
            mime = (guessed or "application/octet-stream").lower()
        fn_field = form.get("file_name")
        display_name: str | None = None
        if isinstance(fn_field, str) and fn_field.strip():
            display_name = fn_field.strip()
        elif upload.filename:
            display_name = upload.filename
        mt_field = form.get("media_type")
        declared = _normalize_form_media_type(str(mt_field)) if isinstance(mt_field, str) else None
        return _store_local_media_bytes(
            workspace_id,
            raw,
            mime,
            display_name=display_name,
            declared_media_type=declared,
            db=db,
        )

    raise HTTPException(
        status_code=415,
        detail="Use Content-Type: application/json (body: data_url as base64) or multipart/form-data (file upload).",
    )


def add_media_library_by_url(body: MediaAddByUrlRequest, db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Save an existing Cloudinary (or local media-assets) URL into the workspace library without re-uploading."""
    workspace_id = str(user["id"])
    media_url = _validate_media_library_external_url(body.media_url, workspace_id=workspace_id)
    existing = db.execute(
        text("select id, media_type, name from flowpilot_media_library where workspace_id = :workspace_id and media_url = :media_url"),
        {"workspace_id": workspace_id, "media_url": media_url},
    ).mappings().first()
    if existing is not None:
        return {
            "id": str(existing["id"]),
            "media_url": media_url,
            "media_type": str(existing["media_type"]),
            "name": str(existing["name"]),
            "duplicate": True,
        }
    url_l = media_url.lower()
    if body.media_type in {"Image", "Video", "Carousel"}:
        media_type = body.media_type
    elif "/video/upload/" in url_l:
        media_type = "Video"
    else:
        media_type = "Image"
    if media_type == "Carousel":
        media_type = "Image"
    asset_id = f"med-{uuid.uuid4().hex[:12]}"
    label = (body.name or "").strip() or "Linked media"
    db.execute(
        text(
            "insert into flowpilot_media_library (id, workspace_id, name, media_type, media_url, created_at) "
            "values (:id, :workspace_id, :name, :media_type, :media_url, now())"
        ),
        {
            "id": asset_id,
            "workspace_id": workspace_id,
            "name": label[:300],
            "media_type": media_type,
            "media_url": media_url,
        },
    )
    record_activity(db, workspace_id, "Media setup added a library item from URL.")
    db.commit()
    return {"id": asset_id, "media_url": media_url, "media_type": media_type, "name": label[:300], "duplicate": False}


@app.post("/media/library/remove")
def remove_media_library_item(body: MediaRemoveRequest, db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, int]:
    workspace_id = str(user["id"])
    row = db.execute(
        text("select media_url from flowpilot_media_library where workspace_id = :workspace_id and id = :asset_id"),
        {"workspace_id": workspace_id, "asset_id": body.asset_id},
    ).mappings().first()
    if row and row.get("media_url"):
        u = str(row["media_url"])
        _try_unlink_local_media_file(u)
        _try_destroy_cloudinary_delivery_asset(u)
    result = db.execute(
        text("delete from flowpilot_media_library where workspace_id = :workspace_id and id = :asset_id"),
        {"workspace_id": workspace_id, "asset_id": body.asset_id},
    )
    db.commit()
    return {"removed": int(result.rowcount or 0)}


@app.post("/analytics/analyze")
def analyze_content(body: AnalyticsRequest) -> dict[str, Any]:
    try:
        return run_analytics_agent(body.content, body.likes, body.comments, body.reach, body.ai_model)
    except AgentError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/generate", response_model=GenerateResponse)
def generate(body: GenerateRequest, db: Session = Depends(get_db)) -> GenerateResponse:
    try:
        strategy, posts = generate_reviewed_content(body.niche.strip())
        rows = create_many_content(db, posts)
    except AgentError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Content generation failed")
        raise HTTPException(status_code=500, detail="Content generation failed") from exc

    return GenerateResponse(strategy=strategy, content=[serialize_content(row) for row in rows])


@app.get("/content", response_model=list[ContentResponse])
def content(db: Session = Depends(get_db)) -> list[ContentResponse]:
    return [serialize_content(row) for row in get_all_content(db)]


@app.post("/approve/{content_id}", response_model=ContentResponse)
def approve(content_id: uuid.UUID, body: ApproveRequest, db: Session = Depends(get_db)) -> ContentResponse:
    row = update_status(db, content_id, "approved", scheduled_time=body.scheduled_time)
    if row is None:
        raise HTTPException(status_code=404, detail="Content not found")
    notify_content_action("approved", row, body.scheduled_time)
    return serialize_content(row)


@app.post("/reject/{content_id}", response_model=ContentResponse)
def reject(content_id: uuid.UUID, db: Session = Depends(get_db)) -> ContentResponse:
    row = update_status(db, content_id, "rejected")
    if row is None:
        raise HTTPException(status_code=404, detail="Content not found")
    notify_content_action("rejected", row)
    return serialize_content(row)


@app.post("/publish/{content_id}", response_model=PublishResponse)
def publish(content_id: uuid.UUID, db: Session = Depends(get_db)) -> PublishResponse:
    row = get_content(db, content_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Content not found")
    if row.status == "published":
        return PublishResponse(success=True, message="Content already published", content=serialize_content(row))

    result = publish_post(row)
    if result.success:
        updated = update_status(db, row.id, "published")
        if updated is None:
            raise HTTPException(status_code=404, detail="Content not found")
        notify_content_action("published", updated)
        return PublishResponse(success=True, message=result.message, content=serialize_content(updated))

    retried = increment_retry(db, row.id)
    if retried is None:
        raise HTTPException(status_code=404, detail="Content not found")
    if retried.retry_count >= settings.max_publish_retries:
        retried = update_status(db, row.id, "failed") or retried

    return PublishResponse(success=False, message=result.message, content=serialize_content(retried))


def _bind_media_routes_if_missing() -> None:
    """Uvicorn --reload (esp. Windows) can drop or half-register media routes. Strip and re-add so POST/GET always work."""

    def _strip_api_routes(path: str, methods: set[str]) -> None:
        kept: list[Any] = []
        dropped = False
        for route in list(app.routes):
            if (
                isinstance(route, APIRoute)
                and route.path == path
                and route.methods
                and methods <= {m.upper() for m in route.methods}
            ):
                dropped = True
                continue
            kept.append(route)
        if dropped:
            app.router.routes = kept

    static_p = f"/{MEDIA_PATH_SEG}/{{workspace_id}}/{{file_name}}"

    for path, handler in (
        ("/media/upload/cloudinary", upload_cloudinary_media),
        ("/media/upload/local", upload_local_media),
        ("/media/library/add-url", add_media_library_by_url),
    ):
        _strip_api_routes(path, {"POST"})
        app.add_api_route(path, handler, methods=["POST"])

    _strip_api_routes(static_p, {"GET"})
    app.add_api_route(static_p, serve_local_media_file, methods=["GET"])


_bind_media_routes_if_missing()
