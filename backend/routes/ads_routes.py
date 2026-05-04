from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import fresh_settings
from database import get_db
from services import ads_service
from utils.token_crypto import decrypt_secret

router = APIRouter(prefix="/ads", tags=["ads"])


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


class AdsBoostRequest(BaseModel):
    post_id: str = Field(min_length=36, max_length=36)
    budget: float = Field(gt=0, le=100_000, description="Approximate daily budget in major currency units (e.g. USD)")


@router.post("/boost")
def create_boost_campaign(body: AdsBoostRequest, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Optional Meta Marketing API flow: create a paused campaign/adset/ad for an existing Page post.
    Does not import posting_service; uses the user's stored Meta user token only.
    """
    identity = _current_user(request, db)
    s = fresh_settings()
    try:
        uuid.UUID(body.post_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid post_id") from exc

    post = db.execute(
        text(
            """
            select id, user_id, workspace_id, status
            from posts
            where id = cast(:post_id as uuid)
              and user_id = :user_id
              and workspace_id = :workspace_id
            """
        ),
        {"post_id": body.post_id, "user_id": identity["user_id"], "workspace_id": identity["workspace_id"]},
    ).mappings().first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post["status"]).lower() != "published":
        raise HTTPException(status_code=400, detail="Post must be published")

    target = db.execute(
        text(
            """
            select pt.response
            from post_targets pt
            where pt.post_id = cast(:post_id as uuid)
              and pt.platform = 'meta'
              and pt.status = 'success'
            order by pt.created_at asc
            limit 1
            """
        ),
        {"post_id": body.post_id},
    ).mappings().first()
    if not target:
        raise HTTPException(status_code=400, detail="No successful Meta target for this post")
    resp = target["response"]
    if isinstance(resp, str):
        try:
            resp = json.loads(resp)
        except json.JSONDecodeError:
            resp = {}
    if not isinstance(resp, dict):
        resp = {}
    story = str(resp.get("id") or "").strip()
    if "_" not in story:
        raise HTTPException(
            status_code=400,
            detail="Meta target is not a Facebook Page post id (Instagram-only publishes cannot use this flow)",
        )

    token_row = db.execute(
        text(
            """
            select access_token
            from social_accounts
            where user_id = :user_id
              and workspace_id = :workspace_id
              and platform = 'meta'
              and is_active = true
            order by updated_at desc
            limit 1
            """
        ),
        {"user_id": identity["user_id"], "workspace_id": identity["workspace_id"]},
    ).mappings().first()
    if not token_row:
        raise HTTPException(status_code=400, detail="No active Meta account for this workspace")
    access_token = decrypt_secret(str(token_row.get("access_token") or "")).strip()
    if not access_token:
        raise HTTPException(status_code=400, detail="Meta token unavailable")

    accounts = ads_service.list_ad_accounts(
        access_token=access_token,
        api_version=s.meta_graph_api_version,
        timeout_seconds=s.request_timeout_seconds,
    )
    if not accounts:
        raise HTTPException(
            status_code=400,
            detail="No Meta ad accounts visible for this token (grant ads_management and ensure a billing setup)",
        )
    ad_account_id = str(accounts[0].get("id") or accounts[0].get("account_id") or "").replace("act_", "")
    if not ad_account_id:
        raise HTTPException(status_code=400, detail="Could not resolve ad account id")

    row_id = str(uuid.uuid4())
    daily_cents = max(100, int(round(float(body.budget) * 100)))

    try:
        campaign_id = ads_service.create_campaign(
            access_token=access_token,
            ad_account_id=ad_account_id,
            name=f"boost-{body.post_id[:8]}",
            api_version=s.meta_graph_api_version,
            timeout_seconds=s.request_timeout_seconds,
        )
        adset_id = ads_service.create_adset(
            access_token=access_token,
            ad_account_id=ad_account_id,
            campaign_id=campaign_id,
            name=f"boost-set-{body.post_id[:8]}",
            daily_budget_cents=daily_cents,
            api_version=s.meta_graph_api_version,
            timeout_seconds=s.request_timeout_seconds,
        )
        creative_id = ads_service.create_ad_creative(
            access_token=access_token,
            ad_account_id=ad_account_id,
            name=f"boost-cr-{body.post_id[:8]}",
            object_story_id=story,
            api_version=s.meta_graph_api_version,
            timeout_seconds=s.request_timeout_seconds,
        )
        ad_id = ads_service.create_ad(
            access_token=access_token,
            ad_account_id=ad_account_id,
            name=f"boost-ad-{body.post_id[:8]}",
            adset_id=adset_id,
            creative_id=creative_id,
            api_version=s.meta_graph_api_version,
            timeout_seconds=s.request_timeout_seconds,
        )
    except Exception as exc:
        db.execute(
            text(
                """
                insert into ads_campaigns (
                    id, user_id, workspace_id, post_id, platform,
                    campaign_id, ad_id, budget, status, created_at
                )
                values (
                    cast(:id as uuid), :user_id, :workspace_id, cast(:post_id as uuid), 'meta',
                    null, null, :budget, 'failed', now()
                )
                """
            ),
            {
                "id": row_id,
                "user_id": identity["user_id"],
                "workspace_id": identity["workspace_id"],
                "post_id": body.post_id,
                "budget": body.budget,
            },
        )
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)[:500]) from exc

    db.execute(
        text(
            """
            insert into ads_campaigns (
                id, user_id, workspace_id, post_id, platform,
                campaign_id, ad_id, budget, status, created_at
            )
            values (
                cast(:id as uuid), :user_id, :workspace_id, cast(:post_id as uuid), 'meta',
                :campaign_id, :ad_id, :budget, 'created', now()
            )
            """
        ),
        {
            "id": row_id,
            "user_id": identity["user_id"],
            "workspace_id": identity["workspace_id"],
            "post_id": body.post_id,
            "campaign_id": campaign_id,
            "ad_id": ad_id,
            "budget": body.budget,
        },
    )
    db.commit()
    return {"ok": True, "row_id": row_id, "campaign_id": campaign_id, "ad_id": ad_id}
