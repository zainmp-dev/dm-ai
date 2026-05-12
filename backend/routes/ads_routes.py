from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from services.meta_promotion import create_meta_boost, failed_boost_row, insert_ads_campaign_row


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ads", tags=["ads"])


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


class AdsBoostRequest(BaseModel):
    post_id: str = Field(min_length=36, max_length=36)
    budget: float = Field(gt=0, le=100_000, description="Approximate daily budget in major currency units (e.g. USD)")


@router.post("/boost")
def create_boost_campaign(body: AdsBoostRequest, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Optional Meta Marketing API flow: create a paused campaign/adset/ad for an existing Page post.
    """
    identity = _current_user(request, db)
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

    row_id = str(uuid.uuid4())
    try:
        created = create_meta_boost(
            db,
            user_id=identity["user_id"],
            workspace_id=identity["workspace_id"],
            post_id=body.post_id,
            budget=body.budget,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "no_meta_target":
            raise HTTPException(status_code=400, detail="No successful Meta target for this post") from exc
        if code == "no_meta_token":
            raise HTTPException(status_code=400, detail="No active Meta account for this workspace") from exc
        if code in {"no_ad_accounts", "no_ad_account_id"}:
            raise HTTPException(
                status_code=400,
                detail="No Meta ad accounts visible for this token (grant ads_management and ensure a billing setup)",
            ) from exc
        raise HTTPException(status_code=400, detail="Could not create boost campaign") from exc
    except Exception:
        failed_boost_row(
            db,
            row_id=row_id,
            user_id=identity["user_id"],
            workspace_id=identity["workspace_id"],
            post_id=body.post_id,
            budget=body.budget,
        )
        db.commit()
        logger.exception("Meta ads boost creation failed")
        raise HTTPException(status_code=400, detail="Could not create boost campaign. Try again later.") from None

    insert_ads_campaign_row(
        db,
        row_id=row_id,
        user_id=identity["user_id"],
        workspace_id=identity["workspace_id"],
        post_id=body.post_id,
        platform="meta",
        budget=body.budget,
        status="created",
        lifecycle="paused",
        campaign_id=created["campaign_id"],
        ad_id=created["ad_id"],
        adset_id=created["adset_id"],
        creative_id=created["creative_id"],
        name=f"boost-{body.post_id[:8]}",
        objective="OUTCOME_AWARENESS",
        platform_data={},
    )
    db.commit()
    return {"ok": True, "row_id": row_id, "campaign_id": created["campaign_id"], "ad_id": created["ad_id"]}
