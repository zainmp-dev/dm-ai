from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from services.oauth_service import linkedin_callback, linkedin_connect_url, meta_callback, meta_connect_url
from services.posting_service import publish_post
from services.token_service import list_social_accounts
from utils.rate_limit import check_rate_limit


router = APIRouter(tags=["social"])


def _request_origin(request: Request) -> str:
    url = request.url
    return f"{url.scheme}://{url.netloc}"


class PostTargetInput(BaseModel):
    platform: str = Field(min_length=2, max_length=20)
    social_account_id: str = Field(min_length=36, max_length=36)


class CreatePostRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    media_url: str | None = Field(default=None, max_length=1200)
    status: str = Field(default="draft", max_length=20)
    scheduled_at: datetime | None = None
    workspace_id: str | None = Field(default=None, max_length=120)
    targets: list[PostTargetInput] = Field(default_factory=list)


def _current_user(request: Request, db: Session) -> dict[str, str]:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = auth.removeprefix("Bearer ").strip()
    if not token.startswith("flowpilot-"):
        raise HTTPException(status_code=401, detail="Invalid auth token")
    user_id = token.removeprefix("flowpilot-").rsplit("-", 1)[0]
    row = db.execute(text("select id from flowpilot_users where id = :id"), {"id": user_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    return {"user_id": user_id, "workspace_id": user_id}


@router.get("/connect/linkedin")
def get_connect_linkedin(request: Request, db: Session = Depends(get_db), workspace_id: str | None = Query(default=None)) -> dict[str, Any]:
    if not check_rate_limit(f"connect-linkedin:{request.client.host if request.client else 'unknown'}", max_requests=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests")
    identity = _current_user(request, db)
    ws = workspace_id or identity["workspace_id"]
    try:
        auth_url = linkedin_connect_url(
            db,
            user_id=identity["user_id"],
            workspace_id=ws,
            app_origin=_request_origin(request),
        )
        db.commit()
        return {"auth_url": auth_url}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/connect/meta")
def get_connect_meta(request: Request, db: Session = Depends(get_db), workspace_id: str | None = Query(default=None)) -> dict[str, Any]:
    if not check_rate_limit(f"connect-meta:{request.client.host if request.client else 'unknown'}", max_requests=20, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests")
    identity = _current_user(request, db)
    ws = workspace_id or identity["workspace_id"]
    try:
        auth_url = meta_connect_url(
            db,
            user_id=identity["user_id"],
            workspace_id=ws,
            app_origin=_request_origin(request),
        )
        db.commit()
        return {"auth_url": auth_url}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/auth/linkedin/callback")
@router.get("/linkedin/callback")
def auth_linkedin_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if error:
        raise HTTPException(status_code=400, detail=f"LinkedIn OAuth error: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="LinkedIn callback missing code/state")
    try:
        ids = linkedin_callback(db, code=code, state=state, app_origin=_request_origin(request))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.execute(
        text(
            "insert into flowpilot_integrations (workspace_id, platform, connected, account_name, account_handle, updated_at) "
            "values (:workspace_id, 'linkedin', true, 'LinkedIn', 'connected', now()) "
            "on conflict (workspace_id, platform) do update set connected = true, updated_at = now()"
        ),
        {"workspace_id": ids["workspace_id"]},
    )
    db.commit()
    return {"ok": True, "workspace_id": ids["workspace_id"]}


@router.get("/auth/meta/callback")
def auth_meta_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if error:
        raise HTTPException(status_code=400, detail=f"Meta OAuth error: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Meta callback missing code/state")
    try:
        payload = meta_callback(db, code=code, state=state, app_origin=_request_origin(request))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.execute(
        text(
            "insert into flowpilot_integrations (workspace_id, platform, connected, account_name, account_handle, updated_at) "
            "values (:workspace_id, 'meta', true, 'Meta', 'connected', now()) "
            "on conflict (workspace_id, platform) do update set connected = true, updated_at = now()"
        ),
        {"workspace_id": payload["workspace_id"]},
    )
    db.commit()
    return {"ok": True, "connected_pages": payload["connected_pages"]}


@router.get("/social-accounts")
def get_social_accounts(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    return {"accounts": list_social_accounts(db, user_id=identity["user_id"], workspace_id=identity["workspace_id"])}


@router.post("/posts")
def create_post(body: CreatePostRequest, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    status = body.status if body.status in {"draft", "scheduled", "published", "failed"} else "draft"
    workspace_id = body.workspace_id or identity["workspace_id"]
    post_id = str(uuid.uuid4())
    db.execute(
        text(
            """
            insert into posts (id, user_id, workspace_id, content, media_url, status, scheduled_at, created_at, updated_at)
            values (cast(:id as uuid), :user_id, :workspace_id, :content, :media_url, :status, :scheduled_at, now(), now())
            """
        ),
        {
            "id": post_id,
            "user_id": identity["user_id"],
            "workspace_id": workspace_id,
            "content": body.content,
            "media_url": body.media_url,
            "status": status,
            "scheduled_at": body.scheduled_at,
        },
    )
    for target in body.targets:
        if target.platform not in {"linkedin", "meta"}:
            raise HTTPException(status_code=400, detail=f"Unsupported target platform: {target.platform}")
        db.execute(
            text(
                """
                insert into post_targets (id, post_id, platform, social_account_id, status, response, created_at)
                values (cast(:id as uuid), cast(:post_id as uuid), :platform, cast(:social_account_id as uuid), 'pending', '{}'::jsonb, now())
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "post_id": post_id,
                "platform": target.platform,
                "social_account_id": target.social_account_id,
            },
        )
    db.commit()
    return {"id": post_id, "status": status}


@router.post("/posts/{post_id}/publish")
def publish_post_now(post_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not check_rate_limit(f"publish:{request.client.host if request.client else 'unknown'}", max_requests=40, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many publish requests")
    identity = _current_user(request, db)
    try:
        result = publish_post(db, post_id=post_id, user_id=identity["user_id"], workspace_id=identity["workspace_id"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result
