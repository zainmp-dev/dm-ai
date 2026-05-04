"""
Meta Marketing API helpers for optional in-app boosting.

Does not import or call posting_service — uses Graph only with caller-supplied tokens.
"""

from __future__ import annotations

import json
from typing import Any

from utils.http_client import request_json


def list_ad_accounts(*, access_token: str, api_version: str, timeout_seconds: int) -> list[dict[str, Any]]:
    res = request_json(
        "GET",
        f"https://graph.facebook.com/{api_version}/me/adaccounts",
        timeout_seconds=timeout_seconds,
        log_context="meta list adaccounts",
        params={"fields": "id,account_id,name", "access_token": access_token, "limit": 25},
    )
    data = res.get("data")
    return data if isinstance(data, list) else []


def create_campaign(
    *,
    access_token: str,
    ad_account_id: str,
    name: str,
    api_version: str,
    timeout_seconds: int,
) -> str:
    """Returns Meta campaign id."""
    act = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
    res = request_json(
        "POST",
        f"https://graph.facebook.com/{api_version}/{act}/campaigns",
        timeout_seconds=timeout_seconds,
        log_context="meta ads create campaign",
        data={
            "access_token": access_token,
            "name": name[:180],
            "objective": "OUTCOME_AWARENESS",
            "buying_type": "AUCTION",
            "status": "PAUSED",
            "special_ad_categories": json.dumps([]),
        },
    )
    cid = str(res.get("id") or "").strip()
    if not cid:
        raise RuntimeError("Meta did not return a campaign id")
    return cid


def create_adset(
    *,
    access_token: str,
    ad_account_id: str,
    campaign_id: str,
    name: str,
    daily_budget_cents: int,
    api_version: str,
    timeout_seconds: int,
) -> str:
    act = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
    targeting = {
        "geo_locations": {"countries": ["US"]},
        "publisher_platforms": ["facebook", "instagram"],
    }
    res = request_json(
        "POST",
        f"https://graph.facebook.com/{api_version}/{act}/adsets",
        timeout_seconds=timeout_seconds,
        log_context="meta ads create adset",
        data={
            "access_token": access_token,
            "name": name[:180],
            "campaign_id": campaign_id,
            "daily_budget": str(max(100, int(daily_budget_cents))),
            "billing_event": "IMPRESSIONS",
            "optimization_goal": "REACH",
            "targeting": json.dumps(targeting),
            "status": "PAUSED",
        },
    )
    aid = str(res.get("id") or "").strip()
    if not aid:
        raise RuntimeError("Meta did not return an adset id")
    return aid


def create_ad_creative(
    *,
    access_token: str,
    ad_account_id: str,
    name: str,
    object_story_id: str,
    api_version: str,
    timeout_seconds: int,
) -> str:
    act = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
    res = request_json(
        "POST",
        f"https://graph.facebook.com/{api_version}/{act}/adcreatives",
        timeout_seconds=timeout_seconds,
        log_context="meta ads create creative",
        data={
            "access_token": access_token,
            "name": name[:180],
            "object_story_id": object_story_id,
        },
    )
    cid = str(res.get("id") or "").strip()
    if not cid:
        raise RuntimeError("Meta did not return a creative id")
    return cid


def create_ad(
    *,
    access_token: str,
    ad_account_id: str,
    name: str,
    adset_id: str,
    creative_id: str,
    api_version: str,
    timeout_seconds: int,
) -> str:
    act = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
    res = request_json(
        "POST",
        f"https://graph.facebook.com/{api_version}/{act}/ads",
        timeout_seconds=timeout_seconds,
        log_context="meta ads create ad",
        data={
            "access_token": access_token,
            "name": name[:180],
            "adset_id": adset_id,
            "creative": json.dumps({"creative_id": creative_id}),
            "status": "PAUSED",
        },
    )
    aid = str(res.get("id") or "").strip()
    if not aid:
        raise RuntimeError("Meta did not return an ad id")
    return aid
