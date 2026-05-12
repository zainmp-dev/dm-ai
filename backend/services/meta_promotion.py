"""Shared Meta Marketing API promotion flows for posts + ads_campaigns rows."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from config import fresh_settings
from services import ads_service
from utils.token_crypto import decrypt_secret

logger = logging.getLogger(__name__)


def meta_object_story_id_for_post(db: Session, post_id: str) -> str | None:
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
        {"post_id": post_id},
    ).mappings().first()
    if not target:
        return None
    resp = target["response"]
    if isinstance(resp, str):
        try:
            resp = json.loads(resp)
        except json.JSONDecodeError:
            resp = {}
    if not isinstance(resp, dict):
        return None
    story = str(resp.get("id") or "").strip()
    if "_" not in story:
        return None
    return story


def meta_access_token_for_workspace(db: Session, user_id: str, workspace_id: str) -> str | None:
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
        {"user_id": user_id, "workspace_id": workspace_id},
    ).mappings().first()
    if not token_row:
        return None
    return decrypt_secret(str(token_row.get("access_token") or "")).strip() or None


def create_meta_boost(
    db: Session,
    *,
    user_id: str,
    workspace_id: str,
    post_id: str,
    budget: float,
    name_prefix: str | None = None,
) -> dict[str, Any]:
    s = fresh_settings()
    story = meta_object_story_id_for_post(db, post_id)
    if not story:
        raise ValueError("no_meta_target")

    access_token = meta_access_token_for_workspace(db, user_id, workspace_id)
    if not access_token:
        raise ValueError("no_meta_token")

    accounts = ads_service.list_ad_accounts(
        access_token=access_token,
        api_version=s.meta_graph_api_version,
        timeout_seconds=s.request_timeout_seconds,
    )
    if not accounts:
        raise ValueError("no_ad_accounts")

    ad_account_id = str(accounts[0].get("id") or accounts[0].get("account_id") or "").replace("act_", "")
    if not ad_account_id:
        raise ValueError("no_ad_account_id")

    prefix = (name_prefix or f"boost-{post_id[:8]}")[:160]
    daily_cents = max(100, int(round(float(budget) * 100)))

    campaign_id = ads_service.create_campaign(
        access_token=access_token,
        ad_account_id=ad_account_id,
        name=f"{prefix}-cmp",
        api_version=s.meta_graph_api_version,
        timeout_seconds=s.request_timeout_seconds,
    )
    adset_id = ads_service.create_adset(
        access_token=access_token,
        ad_account_id=ad_account_id,
        campaign_id=campaign_id,
        name=f"{prefix}-set",
        daily_budget_cents=daily_cents,
        api_version=s.meta_graph_api_version,
        timeout_seconds=s.request_timeout_seconds,
    )
    creative_id = ads_service.create_ad_creative(
        access_token=access_token,
        ad_account_id=ad_account_id,
        name=f"{prefix}-cr",
        object_story_id=story,
        api_version=s.meta_graph_api_version,
        timeout_seconds=s.request_timeout_seconds,
    )
    ad_id = ads_service.create_ad(
        access_token=access_token,
        ad_account_id=ad_account_id,
        name=f"{prefix}-ad",
        adset_id=adset_id,
        creative_id=creative_id,
        api_version=s.meta_graph_api_version,
        timeout_seconds=s.request_timeout_seconds,
    )
    return {
        "campaign_id": campaign_id,
        "adset_id": adset_id,
        "creative_id": creative_id,
        "ad_id": ad_id,
        "access_token": access_token,
        "api_version": s.meta_graph_api_version,
        "timeout_seconds": s.request_timeout_seconds,
    }


def apply_meta_lifecycle(
    db: Session,
    *,
    user_id: str,
    workspace_id: str,
    promotion_row: dict[str, Any],
    lifecycle: str,
) -> None:
    """Pause / resume / archive Meta objects for a promotions row."""
    want = lifecycle.strip().lower()
    if want not in {"paused", "active", "archived"}:
        raise ValueError("bad_lifecycle")

    access_token = meta_access_token_for_workspace(db, user_id, workspace_id)
    if not access_token:
        raise ValueError("no_meta_token")

    s = fresh_settings()
    api_version = s.meta_graph_api_version
    timeout = s.request_timeout_seconds

    ad_id = str(promotion_row.get("ad_id") or "").strip()
    adset_id = str(promotion_row.get("adset_id") or "").strip()
    campaign_id = str(promotion_row.get("campaign_id") or "").strip()

    if want == "active":
        order = [
            ("campaign", campaign_id, "ACTIVE"),
            ("adset", adset_id, "ACTIVE"),
            ("ad", ad_id, "ACTIVE"),
        ]
    elif want == "paused":
        order = [
            ("ad", ad_id, "PAUSED"),
            ("adset", adset_id, "PAUSED"),
            ("campaign", campaign_id, "PAUSED"),
        ]
    else:
        order = [
            ("ad", ad_id, "ARCHIVED"),
            ("adset", adset_id, "ARCHIVED"),
            ("campaign", campaign_id, "ARCHIVED"),
        ]

    for _kind, oid, status in order:
        if not oid:
            continue
        try:
            ads_service.update_object_status(
                access_token=access_token,
                object_id=oid,
                status=status,
                api_version=api_version,
                timeout_seconds=timeout,
            )
        except Exception:
            logger.warning("meta set status failed for %s %s", oid, status, exc_info=True)
            raise


def insert_ads_campaign_row(
    db: Session,
    *,
    row_id: str,
    user_id: str,
    workspace_id: str,
    post_id: str,
    platform: str,
    budget: float,
    status: str,
    lifecycle: str,
    campaign_id: str | None,
    ad_id: str | None,
    adset_id: str | None,
    creative_id: str | None,
    name: str | None,
    objective: str | None = None,
    platform_data: dict[str, Any] | None = None,
) -> None:
    db.execute(
        text(
            """
            insert into ads_campaigns (
                id, user_id, workspace_id, post_id, platform,
                campaign_id, ad_id, adset_id, creative_id, budget, status, name, objective,
                lifecycle, platform_data, created_at, updated_at
            )
            values (
                cast(:id as uuid), :user_id, :workspace_id, cast(:post_id as uuid), :platform,
                :campaign_id, :ad_id, :adset_id, :creative_id, :budget, :status, :name, :objective,
                :lifecycle, cast(:platform_data as jsonb), now(), now()
            )
            """
        ),
        {
            "id": row_id,
            "user_id": user_id,
            "workspace_id": workspace_id,
            "post_id": post_id,
            "platform": platform,
            "campaign_id": campaign_id,
            "ad_id": ad_id,
            "adset_id": adset_id,
            "creative_id": creative_id,
            "budget": budget,
            "status": status,
            "name": name,
            "objective": objective,
            "lifecycle": lifecycle,
            "platform_data": json.dumps(platform_data or {}),
        },
    )


def failed_boost_row(
    db: Session,
    *,
    row_id: str,
    user_id: str,
    workspace_id: str,
    post_id: str,
    budget: float,
) -> None:
    insert_ads_campaign_row(
        db,
        row_id=row_id,
        user_id=user_id,
        workspace_id=workspace_id,
        post_id=post_id,
        platform="meta",
        budget=budget,
        status="failed",
        lifecycle="failed",
        campaign_id=None,
        ad_id=None,
        adset_id=None,
        creative_id=None,
        name=None,
    )
