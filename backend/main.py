from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from agents import (
    AgentError,
    generate_reviewed_content,
    generate_workspace_research,
    run_analytics_agent,
    suggest_master_content_post,
)
from config import settings
from database import Content, create_many_content, get_all_content, get_content, get_db, init_db, increment_retry, update_status
from emailer import content_action_email, safe_send_email
from publisher import publish_post
from scheduler import scheduler_loop


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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


class AnalyticsRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    reach: int = Field(default=0, ge=0)
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
    primary_region: str = Field(default="global", max_length=32)
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
    calendar_days: int | None = Field(default=14, ge=1, le=90)
    media_type: str | None = Field(default="Image", max_length=20)
    media_preview: str | None = Field(default=None, max_length=1000)
    scheduled_at: datetime | None = None
    auto_activate: bool | None = False
    ai_model: str | None = Field(default=None, max_length=200)
    suggest_hint: str | None = Field(default=None, max_length=500)


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


def default_workspace_snapshot(user: dict[str, Any] | None = None) -> dict[str, Any]:
    profile_name = str(user["name"]) if user else ""
    profile_email = str(user["email"]) if user else ""
    return {
        "company_name": "",
        "company_website": "",
        "workspace_scenario": "b2b-saas",
        "primary_region": "global",
        "workspace_configured": False,
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
    }


def _normalize_primary_region(value: str | None) -> str:
    v = (value or "global").strip().lower()
    if v in {"global", "uae-gcc", "india", "uae-india"}:
        return v
    return "global"


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
            "primary_region": _normalize_primary_region(str(workspace.get("primary_region", "global") or "global")),
            "workspace_configured": workspace["workspace_configured"],
            "crm_last_bulk_status": workspace["crm_last_bulk_status"],
        }
    )

    strategy = db.execute(
        text("select target_audience, content_themes, platform_focus, market_gaps from flowpilot_strategy where workspace_id = :workspace_id"),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if strategy is not None:
        snapshot["strategy"] = dict(strategy)

    for key, table, order_by in (
        ("competitors", "flowpilot_competitors", "name"),
        ("content", "flowpilot_content", "id"),
        ("leads", "flowpilot_leads", "captured_at desc"),
        ("activities", "flowpilot_activities", "created_at desc"),
        ("publishing_log", "flowpilot_publishing_log", "timestamp desc"),
        ("campaigns", "flowpilot_campaigns", "name"),
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


def _upload_to_cloudinary(data_url: str, file_name: str | None) -> str:
    if not settings.cloudinary_cloud_name or not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
        raise HTTPException(status_code=400, detail="Cloudinary credentials are not configured")
    timestamp = str(int(time.time()))
    params = {
        "folder": settings.cloudinary_folder,
        "timestamp": timestamp,
    }
    signature_payload = "&".join(f"{key}={params[key]}" for key in sorted(params))
    signature = hashlib.sha1(f"{signature_payload}{settings.cloudinary_api_secret}".encode()).hexdigest()
    try:
        response = requests.post(
            f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/auto/upload",
            data={
                **params,
                "api_key": settings.cloudinary_api_key,
                "signature": signature,
                "file": data_url,
                "public_id": (file_name or f"flowpilot-{uuid.uuid4().hex[:10]}").rsplit(".", 1)[0],
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
    params: dict[str, str] = {
        "folder": settings.cloudinary_folder,
        "timestamp": timestamp,
    }
    signature_payload = "&".join(f"{key}={params[key]}" for key in sorted(params))
    signature = hashlib.sha1(f"{signature_payload}{settings.cloudinary_api_secret}".encode()).hexdigest()
    try:
        response = requests.post(
            f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/auto/upload",
            data={
                **params,
                "api_key": settings.cloudinary_api_key,
                "signature": signature,
                "file": source_url,
                "public_id": public_id,
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


def _workspace_context(db: Session, workspace_id: str) -> dict[str, str]:
    row = db.execute(
        text(
            "select company_name, company_website, workspace_scenario, coalesce(primary_region, 'global') as primary_region "
            "from flowpilot_workspace where workspace_id = :workspace_id"
        ),
        {"workspace_id": workspace_id},
    ).mappings().first()
    if row is None:
        return {"company_name": "", "company_website": "", "workspace_scenario": "b2b-saas", "primary_region": "global"}
    return {
        "company_name": str(row["company_name"] or ""),
        "company_website": str(row["company_website"] or ""),
        "workspace_scenario": str(row["workspace_scenario"] or "b2b-saas"),
        "primary_region": _normalize_primary_region(str(row.get("primary_region", "global") or "global")),
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
    calendar_days: int = 7,
    primary_region: str = "global",
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

    db.execute(text("delete from flowpilot_strategy where workspace_id = :workspace_id"), {"workspace_id": workspace_id})
    db.execute(text("delete from flowpilot_competitors where workspace_id = :workspace_id"), {"workspace_id": workspace_id})
    strategy_columns = _column_types(db, "flowpilot_strategy")
    updated_at_column = ", updated_at" if "updated_at" in strategy_columns else ""
    updated_at_value = ", now()" if "updated_at" in strategy_columns else ""
    db.execute(
        text(
            "insert into flowpilot_strategy "
            f"(workspace_id, target_audience, content_themes, platform_focus, market_gaps{updated_at_column}) "
            f"values (:workspace_id, :target_audience, {_list_expr(db, 'flowpilot_strategy', 'content_themes', 'content_themes')}, "
            f"{_list_expr(db, 'flowpilot_strategy', 'platform_focus', 'platform_focus')}, "
            f"{_list_expr(db, 'flowpilot_strategy', 'market_gaps', 'market_gaps')}{updated_at_value})"
        ),
        {
            "workspace_id": workspace_id,
            "target_audience": strategy["target_audience"],
            "content_themes": _list_value(db, "flowpilot_strategy", "content_themes", strategy["content_themes"]),
            "platform_focus": _list_value(db, "flowpilot_strategy", "platform_focus", strategy["platform_focus"]),
            "market_gaps": _list_value(db, "flowpilot_strategy", "market_gaps", strategy["market_gaps"]),
        },
    )

    for competitor in competitor_rows[:8]:
        db.execute(
            text(
                "insert into flowpilot_competitors "
                "(id, workspace_id, name, positioning, strengths, weaknesses) "
                f"values (:id, :workspace_id, :name, :positioning, {_list_expr(db, 'flowpilot_competitors', 'strengths', 'strengths')}, "
                f"{_list_expr(db, 'flowpilot_competitors', 'weaknesses', 'weaknesses')})"
            ),
            {
                "id": f"cmp-{uuid.uuid4().hex[:12]}",
                "workspace_id": workspace_id,
                "name": competitor["name"],
                "positioning": competitor["positioning"],
                "strengths": _list_value(db, "flowpilot_competitors", "strengths", competitor["strengths"]),
                "weaknesses": _list_value(db, "flowpilot_competitors", "weaknesses", competitor["weaknesses"]),
            },
        )

    if replace_content:
        db.execute(text("delete from flowpilot_content where workspace_id = :workspace_id"), {"workspace_id": workspace_id})
        for index, item in enumerate(research["content"][:12]):
            media_preview = item["media_preview"] or f"https://picsum.photos/seed/{workspace_id}-{index}/800/450"
            db.execute(
                text(
                    "insert into flowpilot_content "
                    "(id, workspace_id, title, content_text, media_type, media_preview, status, selected_platform, scheduled_at) "
                    "values (:id, :workspace_id, :title, :content_text, :media_type, :media_preview, 'PENDING', null, null)"
                ),
                {
                    "id": f"cnt-{uuid.uuid4().hex[:12]}",
                    "workspace_id": workspace_id,
                    "title": item["title"],
                    "content_text": item["content_text"],
                    "media_type": item["media_type"],
                    "media_preview": media_preview,
                },
            )

    competitor_mode = "manual competitor inputs" if competitors else "automatic competitor discovery"
    model_label = ai_model or settings.openrouter_model
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
    return research


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    """Base URL: opening http://127.0.0.1:8001/ in a browser is expected to hit this, not 404."""
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


@app.delete("/workspace")
def delete_workspace(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    for table in (
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
            calendar_days=7,
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
            calendar_days=7,
            primary_region=context["primary_region"],
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Strategy research failed")
        raise HTTPException(status_code=500, detail="Strategy research failed") from exc

    return {"strategy": research["strategy"], "competitors": research["competitors"]}


@app.post("/content")
def workspace_content(
    body: ContentLibraryRequest,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    workspace_id = str(user["id"])
    if body.action == "generate":
        context = _workspace_context(db, workspace_id)
        try:
            save_workspace_ai_flow(
                db,
                workspace_id=workspace_id,
                company_name=context["company_name"],
                website=context["company_website"],
                scenario=context["workspace_scenario"],
                competitors=[],
                ai_model=body.ai_model,
                replace_content=True,
                calendar_days=body.calendar_days or 14,
                primary_region=context["primary_region"],
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.exception("Content generation failed")
            raise HTTPException(status_code=500, detail="Content generation failed") from exc
    elif body.action == "suggest":
        context = _workspace_context(db, workspace_id)
        if not (context.get("company_name") or "").strip():
            raise HTTPException(
                status_code=400,
                detail="Add your company name in workspace setup before using AI suggest.",
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
                "select name, positioning from flowpilot_competitors where workspace_id = :workspace_id order by name limit 8"
            ),
            {"workspace_id": workspace_id},
        ).mappings().all()
        competitors = [
            {"name": str(r["name"]), "website": "", "focus": str(r["positioning"] or "")} for r in competitor_rows
        ]
        try:
            suggestion = suggest_master_content_post(
                company_name=str(context["company_name"]),
                website=str(context["company_website"] or ""),
                scenario=str(context["workspace_scenario"] or "b2b-saas"),
                competitors=competitors,
                strategy_snapshot=strategy_snapshot,
                hint=(body.suggest_hint or "").strip(),
                ai_model=body.ai_model,
                workspace_id=workspace_id,
                primary_region=context["primary_region"],
            )
        except AgentError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        suggestion = _suggestion_ingest_cloudinary(db, workspace_id, suggestion)
        model_label = body.ai_model or settings.openrouter_model
        record_activity(
            db,
            workspace_id,
            f"AI suggested a Master content draft using {model_label}.",
        )
        db.commit()
        return {
            "suggestion": suggestion,
            "content": workspace_snapshot(db, workspace_id, user)["content"],
        }
    elif body.action == "create":
        default_platform = _default_platform(db, workspace_id) if body.auto_activate else None
        status = "SCHEDULED" if body.auto_activate and body.scheduled_at else "APPROVED" if body.auto_activate else "PENDING"
        db.execute(
            text(
                "insert into flowpilot_content "
                "(id, workspace_id, title, content_text, media_type, media_preview, status, selected_platform, scheduled_at) "
                "values (:id, :workspace_id, :title, :content_text, :media_type, :media_preview, :status, :selected_platform, :scheduled_at)"
            ),
            {
                "id": f"cnt-{uuid.uuid4().hex[:12]}",
                "workspace_id": workspace_id,
                "title": (body.title or "Untitled content").strip(),
                "content_text": (body.content_text or "").strip(),
                "media_type": body.media_type or "Image",
                "media_preview": body.media_preview or f"https://picsum.photos/seed/{workspace_id}-{uuid.uuid4().hex[:6]}/800/450",
                "status": status,
                "selected_platform": default_platform,
                "scheduled_at": body.scheduled_at,
            },
        )
        record_activity(db, workspace_id, "AI flow added a new content draft to the library.")
        db.commit()
    elif body.action == "update":
        if not body.content_id:
            raise HTTPException(status_code=400, detail="content_id is required")
        default_platform = _default_platform(db, workspace_id) if body.auto_activate else None
        status = "SCHEDULED" if body.auto_activate and body.scheduled_at else "APPROVED" if body.auto_activate else "PENDING"
        db.execute(
            text(
                "update flowpilot_content set "
                "title = coalesce(:title, title), "
                "content_text = coalesce(:content_text, content_text), "
                "media_type = coalesce(:media_type, media_type), "
                "media_preview = coalesce(:media_preview, media_preview), "
                "scheduled_at = coalesce(:scheduled_at, scheduled_at), "
                "selected_platform = coalesce(:selected_platform, selected_platform), "
                "status = :status "
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
                "selected_platform": default_platform,
                "status": status,
            },
        )
        record_activity(db, workspace_id, "Content draft updated and returned to the AI review queue.")
        db.commit()
    else:
        raise HTTPException(status_code=400, detail="Unsupported content action")

    return {"content": workspace_snapshot(db, workspace_id, user)["content"]}


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
            "update flowpilot_content set status = :status, selected_platform = :platform "
            "where workspace_id = :workspace_id and id = :content_id"
        ),
        {"workspace_id": workspace_id, "content_id": body.content_id, "status": next_status, "platform": first_platform},
    )

    for platform in selected_platforms[1:]:
        clone_id = f"cnt-{uuid.uuid4().hex[:12]}"
        db.execute(
            text(
                "insert into flowpilot_content "
                "(id, workspace_id, title, content_text, media_type, media_preview, status, selected_platform, scheduled_at) "
                "values (:id, :workspace_id, :title, :content_text, :media_type, :media_preview, :status, :platform, :scheduled_at)"
            ),
            {
                "id": clone_id,
                "workspace_id": workspace_id,
                "title": row["title"],
                "content_text": row["content_text"],
                "media_type": row["media_type"],
                "media_preview": row["media_preview"],
                "status": next_status,
                "platform": platform,
                "scheduled_at": row.get("scheduled_at"),
            },
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
        text("update flowpilot_content set status = 'REJECTED' where workspace_id = :workspace_id and id = :content_id"),
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
            "status = case when status = 'PUBLISHED' then status else 'SCHEDULED' end "
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
        post = WorkspacePublishPost(platform=platform, content=str(row["content_text"]), media_url=str(row["media_preview"] or "") or None)
        result = publish_post(post)  # type: ignore[arg-type]
        if result.success:
            published_count += 1
            db.execute(
                text("update flowpilot_content set status = 'PUBLISHED' where workspace_id = :workspace_id and id = :content_id"),
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
    connected = bool(settings.linkedin_access_token and settings.linkedin_author_urn)
    _set_integration(db, workspace_id, "linkedin", connected, "LinkedIn Workspace", settings.linkedin_author_urn or "not-configured")
    record_activity(db, workspace_id, "LinkedIn integration checked and saved.")
    db.commit()
    return {"integrations": workspace_snapshot(db, workspace_id, user)["integrations"]}


@app.post("/connect/meta")
def connect_meta(db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    workspace_id = str(user["id"])
    connected = bool(settings.meta_page_access_token and (settings.meta_page_id or settings.meta_ig_business_account_id))
    handle = settings.meta_page_id or settings.meta_ig_business_account_id or "not-configured"
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


@app.post("/media/upload/cloudinary")
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


@app.post("/media/library/remove")
def remove_media_library_item(body: MediaRemoveRequest, db: Session = Depends(get_db), user: dict[str, Any] = Depends(get_current_user)) -> dict[str, int]:
    workspace_id = str(user["id"])
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
