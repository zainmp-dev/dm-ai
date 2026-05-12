from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from services.boost_link_service import boost_url_for_target
from services.oauth_service import linkedin_callback, linkedin_connect_url, meta_callback, meta_connect_url
from services.posting_service import publish_post
from services.token_service import list_social_accounts
from utils.rate_limit import check_rate_limit


logger = logging.getLogger(__name__)

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
    row = db.execute(
        text("select id from flowpilot_users where id = :id and deleted_at is null"),
        {"id": user_id},
    ).mappings().first()
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
    except Exception:
        logger.exception("Social router: LinkedIn connect URL failed")
        raise HTTPException(status_code=400, detail="Could not start LinkedIn connection.") from None
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
    except Exception:
        logger.exception("Social router: Meta connect URL failed")
        raise HTTPException(status_code=400, detail="Could not start Meta connection.") from None
@router.get("/linkedin/callback")
def auth_linkedin_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if error:
        logger.warning("LinkedIn OAuth callback error param present")
        raise HTTPException(status_code=400, detail="LinkedIn sign-in was cancelled or failed. Try again.")
    if not code or not state:
        raise HTTPException(status_code=400, detail="LinkedIn callback missing code/state")
    try:
        info = linkedin_callback(db, code=code, state=state, app_origin=_request_origin(request))
    except Exception:
        logger.exception("LinkedIn OAuth callback failed")
        raise HTTPException(status_code=400, detail="LinkedIn connection failed. Try again.") from None
    db.execute(
        text(
            "insert into flowpilot_integrations (workspace_id, platform, connected, account_name, account_handle, account_url, updated_at) "
            "values (:workspace_id, 'linkedin', true, :account_name, :account_handle, :account_url, now()) "
            "on conflict (workspace_id, platform) do update set "
            "connected = true, account_name = excluded.account_name, account_handle = excluded.account_handle, "
            "account_url = excluded.account_url, updated_at = now()"
        ),
        {
            "workspace_id": info["workspace_id"],
            "account_name": str(info.get("account_name") or "LinkedIn")[:500],
            "account_handle": str(info.get("account_handle") or "")[:500] or None,
            "account_url": str(info["account_url"]).strip() if info.get("account_url") else None,
        },
    )
    db.commit()
    return {
        "ok": True,
        "workspace_id": info["workspace_id"],
        "profile_pending": bool(info.get("profile_pending")),
    }


@router.get("/auth/meta/callback")
def auth_meta_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if error:
        logger.warning("Meta OAuth callback error param present")
        raise HTTPException(status_code=400, detail="Meta sign-in was cancelled or failed. Try again.")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Meta callback missing code/state")
    try:
        payload = meta_callback(db, code=code, state=state, app_origin=_request_origin(request))
    except Exception:
        logger.exception("Meta OAuth callback failed")
        raise HTTPException(status_code=400, detail="Meta connection failed. Try again.") from None
    db.execute(
        text(
            "insert into flowpilot_integrations (workspace_id, platform, connected, account_name, account_handle, account_url, updated_at) "
            "values (:workspace_id, 'meta', true, :account_name, :account_handle, :account_url, now()) "
            "on conflict (workspace_id, platform) do update set "
            "connected = true, account_name = excluded.account_name, account_handle = excluded.account_handle, "
            "account_url = excluded.account_url, updated_at = now()"
        ),
        {
            "workspace_id": payload["workspace_id"],
            "account_name": str(payload.get("account_name") or "Meta")[:500],
            "account_handle": str(payload.get("account_handle") or "")[:500] or None,
            "account_url": str(payload["account_url"]).strip() if payload.get("account_url") else None,
        },
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
    except ValueError:
        logger.warning("publish_post_now not found or invalid", exc_info=True)
        raise HTTPException(status_code=404, detail="Post not found") from None
    except Exception:
        logger.exception("publish_post_now failed")
        raise HTTPException(status_code=400, detail="Could not publish post") from None
    return result


@router.get("/posts")
def list_posts(request: Request, db: Session = Depends(get_db), limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
    """List native social posts for the authenticated workspace (read-only)."""
    identity = _current_user(request, db)
    rows = db.execute(
        text(
            """
            select p.id, p.content, p.status, p.scheduled_at, p.created_at,
              coalesce(
                json_agg(
                  json_build_object(
                    'platform', pt.platform,
                    'status', pt.status,
                    'response', pt.response,
                    'meta_page_id', sa.meta_page_id
                  )
                  order by pt.created_at
                ) filter (where pt.id is not null),
                '[]'::json
              ) as targets
            from posts p
            left join post_targets pt on pt.post_id = p.id
            left join social_accounts sa on sa.id = pt.social_account_id
            where p.user_id = :user_id and p.workspace_id = :workspace_id
            group by p.id, p.content, p.status, p.scheduled_at, p.created_at
            order by p.created_at desc
            limit :limit
            """
        ),
        {"user_id": identity["user_id"], "workspace_id": identity["workspace_id"], "limit": limit},
    ).mappings().all()
    out: list[dict[str, Any]] = []
    for row in rows:
        raw_targets = row["targets"]
        if not isinstance(raw_targets, list):
            raw_targets = []
        targets: list[dict[str, Any]] = []
        for t in raw_targets:
            if not isinstance(t, dict):
                continue
            platform = str(t.get("platform") or "").strip().lower()
            post_url = boost_url_for_target(
                platform=platform,
                response=t.get("response"),
                meta_page_id_hint=str(t.get("meta_page_id") or "").strip(),
            )
            targets.append(
                {
                    "platform": str(t.get("platform") or ""),
                    "status": str(t.get("status") or ""),
                    "post_url": post_url,
                }
            )
        out.append(
            {
                "id": str(row["id"]),
                "content": (str(row["content"] or "")[:280] + ("…" if len(str(row["content"] or "")) > 280 else "")),
                "status": str(row["status"]),
                "scheduled_at": row["scheduled_at"].isoformat() if row["scheduled_at"] else None,
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "targets": targets,
            }
        )
    return {"posts": out}


@router.get("/posts/{post_id}/boost-link")
def get_post_boost_link(post_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Return external network URLs for published posts (redirect / deep-link only).
    Does not call posting APIs or mutate posts.
    """
    try:
        uuid.UUID(post_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid post id") from exc
    identity = _current_user(request, db)
    post = db.execute(
        text(
            """
            select id, status
            from posts
            where id = cast(:post_id as uuid)
              and user_id = :user_id
              and workspace_id = :workspace_id
            """
        ),
        {"post_id": post_id, "user_id": identity["user_id"], "workspace_id": identity["workspace_id"]},
    ).mappings().first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post["status"]).lower() != "published":
        raise HTTPException(status_code=400, detail="Post must be published to generate a boost link")

    rows = db.execute(
        text(
            """
            select pt.platform, pt.status, pt.response, sa.meta_page_id
            from post_targets pt
            left join social_accounts sa on sa.id = pt.social_account_id
            where pt.post_id = cast(:post_id as uuid)
            order by pt.created_at asc
            """
        ),
        {"post_id": post_id},
    ).mappings().all()
    if not rows:
        raise HTTPException(status_code=400, detail="No publish targets for this post")

    links: list[dict[str, str]] = []
    for row in rows:
        if str(row["status"]).lower() != "success":
            continue
        platform = str(row["platform"] or "").strip().lower()
        hint = str(row["meta_page_id"] or "").strip()
        url = boost_url_for_target(platform=platform, response=row["response"], meta_page_id_hint=hint)
        if url:
            links.append({"platform": platform, "url": url})

    if not links:
        raise HTTPException(
            status_code=400,
            detail="No boostable publish payload (need a successful Facebook Page post or LinkedIn ugcPost id on targets)",
        )
    return {"links": links}
