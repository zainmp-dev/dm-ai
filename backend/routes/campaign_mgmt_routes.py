"""Published post management, promotions lifecycle, AI hints, analytics snapshots."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import fresh_settings
from database import get_db
from services import ads_service
from services.integration_jobs_service import enqueue_job
from services.linkedin_ads_service import LinkedInAdsNotConfiguredError, create_boost_from_share_stub
from services.meta_promotion import (
    apply_meta_lifecycle,
    create_meta_boost,
    failed_boost_row,
    insert_ads_campaign_row,
    meta_access_token_for_workspace,
    meta_object_story_id_for_post,
)
from services.promotion_ai_service import build_optimization_bundle


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/campaign-mgmt", tags=["campaign-mgmt"])


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


def _require_post(db: Session, post_id: str, identity: dict[str, str]) -> dict[str, Any]:
    try:
        uuid.UUID(post_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid post_id") from exc
    post = db.execute(
        text(
            """
            select id, content, media_url, status
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
    return dict(post)


def _promotions_for_post(db: Session, post_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            select id, platform, campaign_id, adset_id, creative_id, ad_id, budget, status,
                   name, objective, lifecycle, created_at, updated_at
            from ads_campaigns
            where post_id = cast(:post_id as uuid)
            order by created_at desc
            """
        ),
        {"post_id": post_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def _composite_post_status(post_status: str, promotions: list[dict[str, Any]]) -> str:
    ps = str(post_status).lower()
    if ps == "unpublished":
        return "unpublished"
    if ps != "published":
        return ps
    lifecycles = [str(p.get("lifecycle") or "").lower() for p in promotions if str(p.get("status")) != "failed"]
    if any(x == "active" for x in lifecycles):
        return "boosted"
    if lifecycles and all(x in {"archived", "failed"} for x in lifecycles):
        return "published"
    if any(x == "paused" for x in lifecycles):
        return "paused"
    return "published"


@router.get("/posts")
def list_managed_posts(
    request: Request,
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    identity = _current_user(request, db)
    rows = db.execute(
        text(
            """
            select p.id, p.content, p.status, p.scheduled_at, p.created_at,
              coalesce(prom.pr, '[]'::json) as promotions
            from posts p
            left join lateral (
              select json_agg(
                json_build_object(
                  'id', ac.id,
                  'platform', ac.platform,
                  'status', ac.status,
                  'lifecycle', ac.lifecycle,
                  'campaign_id', ac.campaign_id,
                  'ad_id', ac.ad_id,
                  'budget', ac.budget
                ) order by ac.created_at desc
              ) as pr
              from ads_campaigns ac
              where ac.post_id = p.id
            ) prom on true
            where p.user_id = :user_id and p.workspace_id = :workspace_id
            order by p.created_at desc
            limit :limit
            """
        ),
        {"user_id": identity["user_id"], "workspace_id": identity["workspace_id"], "limit": limit},
    ).mappings().all()
    out = []
    for row in rows:
        promos = row["promotions"]
        if promos is None:
            promos = []
        if not isinstance(promos, list):
            promos = []
        st = _composite_post_status(str(row["status"]), promos)
        out.append(
            {
                "id": str(row["id"]),
                "content_preview": (str(row["content"] or "")[:280] + ("…" if len(str(row["content"] or "")) > 280 else "")),
                "status": str(row["status"]),
                "composite_status": st,
                "scheduled_at": row["scheduled_at"].isoformat() if row["scheduled_at"] else None,
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "promotions": promos,
            }
        )
    return {"posts": out}


@router.get("/posts/{post_id}")
def get_managed_post(post_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    post = _require_post(db, post_id, identity)
    promos = _promotions_for_post(db, post_id)
    story = meta_object_story_id_for_post(db, post_id)
    return {
        "post": {
            "id": str(post["id"]),
            "content": str(post["content"] or ""),
            "media_url": post.get("media_url"),
            "status": str(post["status"]),
            "composite_status": _composite_post_status(str(post["status"]), promos),
        },
        "promotions": promos,
        "detected": {"meta_object_story_id": story},
    }


class PatchPostBody(BaseModel):
    content: str | None = Field(default=None, max_length=8000)
    media_url: str | None = Field(default=None, max_length=1200)


@router.patch("/posts/{post_id}")
def patch_post(post_id: str, body: PatchPostBody, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    _require_post(db, post_id, identity)
    if body.content is None and body.media_url is None:
        raise HTTPException(status_code=400, detail="No changes")
    next_v = db.execute(
        text("select coalesce(max(version), 0) + 1 as v from post_versions where post_id = cast(:pid as uuid)"),
        {"pid": post_id},
    ).scalar()
    vid = str(uuid.uuid4())
    cur = db.execute(
        text("select content, media_url from posts where id = cast(:pid as uuid)"),
        {"pid": post_id},
    ).mappings().first()
    assert cur
    new_content = body.content if body.content is not None else str(cur["content"] or "")
    new_media = body.media_url if body.media_url is not None else cur.get("media_url")
    db.execute(
        text(
            """
            insert into post_versions (id, post_id, user_id, workspace_id, version, content, media_url, created_at)
            values (cast(:id as uuid), cast(:post_id as uuid), :user_id, :workspace_id, :version, :content, :media_url, now())
            """
        ),
        {
            "id": vid,
            "post_id": post_id,
            "user_id": identity["user_id"],
            "workspace_id": identity["workspace_id"],
            "version": int(next_v or 1),
            "content": new_content,
            "media_url": new_media,
        },
    )
    db.execute(
        text(
            """
            update posts
            set content = :content, media_url = :media_url, updated_at = now()
            where id = cast(:post_id as uuid)
            """
        ),
        {"post_id": post_id, "content": new_content, "media_url": new_media},
    )
    db.commit()
    return {"ok": True, "version_id": vid, "version": int(next_v or 1)}


class RepublishBody(BaseModel):
    note: str | None = Field(default=None, max_length=500)


@router.post("/posts/{post_id}/republish")
def republish_post(post_id: str, body: RepublishBody, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Local workspace republish record only: networks do not always allow in-place edits.
    Creates an integration job for future remote sync workers.
    """
    identity = _current_user(request, db)
    post = _require_post(db, post_id, identity)
    if str(post["status"]).lower() != "published":
        raise HTTPException(status_code=400, detail="Republish is for published posts (track new version).")
    key = f"republish-{post_id}-{int(datetime.now(timezone.utc).timestamp())}"
    enqueue_job(
        db,
        user_id=identity["user_id"],
        workspace_id=identity["workspace_id"],
        kind="noop",
        idempotency_key=key,
        payload={"post_id": post_id, "note": body.note or "republish"},
    )
    return {
        "ok": True,
        "message": "Version saved locally; remote in-place edit depends on Meta/LinkedIn APIs (job recorded).",
    }


class UnpublishBody(BaseModel):
    pause_promotions: bool = True


@router.post("/posts/{post_id}/unpublish")
def unpublish_post_endpoint(post_id: str, body: UnpublishBody, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    post = _require_post(db, post_id, identity)
    promos = _promotions_for_post(db, post_id)
    paused = 0
    if body.pause_promotions:
        for p in promos:
            if str(p.get("platform")) != "meta":
                continue
            if str(p.get("status")) == "failed":
                continue
            lc = str(p.get("lifecycle") or "").lower()
            if lc in {"archived", "failed"}:
                continue
            try:
                apply_meta_lifecycle(db, user_id=identity["user_id"], workspace_id=identity["workspace_id"], promotion_row=p, lifecycle="archived")
            except Exception:
                logger.exception("unpublish: archive meta promotion %s", p.get("id"))
                raise HTTPException(status_code=502, detail="Could not pause/archive Meta ads. Retry or finish in Ads Manager.") from None
            db.execute(
                text(
                    """
                    update ads_campaigns
                    set lifecycle = 'archived', status = 'archived', updated_at = now()
                    where id = cast(:id as uuid)
                    """
                ),
                {"id": str(p["id"])},
            )
            paused += 1
        db.commit()

    db.execute(
        text(
            """
            update posts set status = 'unpublished', updated_at = now()
            where id = cast(:post_id as uuid)
            """
        ),
        {"post_id": post_id},
    )
    db.commit()
    enqueue_job(
        db,
        user_id=identity["user_id"],
        workspace_id=identity["workspace_id"],
        kind="unpublish_verify",
        idempotency_key=f"unpub-{post_id}",
        payload={"post_id": post_id, "promotions_archived": paused},
    )
    return {"ok": True, "promotions_archived": paused, "post_status": "unpublished"}


class AnalyzeBody(BaseModel):
    platform: str = Field(default="meta", max_length=12)


@router.post("/posts/{post_id}/optimize/analyze")
def analyze_post(post_id: str, body: AnalyzeBody, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    post = _require_post(db, post_id, identity)
    metrics: dict[str, Any] = {"impressions": 0, "engagement_rate_hint": 0.0}
    if body.platform.lower() == "meta":
        story = meta_object_story_id_for_post(db, post_id)
        tok = meta_access_token_for_workspace(db, identity["user_id"], identity["workspace_id"])
        if story and tok:
            cfg = fresh_settings()
            try:
                insights = ads_service.fetch_post_insights_simple(
                    access_token=tok,
                    post_id=story,
                    api_version=cfg.meta_graph_api_version,
                    timeout_seconds=cfg.request_timeout_seconds,
                )
                imp_raw = insights.get("post_impressions")
                eng_raw = insights.get("post_engaged_users")
                imp = int(imp_raw) if imp_raw is not None else 0
                eng = int(eng_raw) if eng_raw is not None else 0
                metrics["impressions"] = imp
                metrics["engaged_users"] = eng
                metrics["engagement_rate_hint"] = (eng / imp) if imp > 0 else 0.0
            except Exception:
                logger.warning("analyze: meta post insights failed", exc_info=True)

    bundle = build_optimization_bundle(post_text=str(post["content"] or ""), metrics=metrics)
    pid = str(uuid.uuid4())
    db.execute(
        text(
            """
            insert into optimization_proposals (
                id, post_id, user_id, workspace_id, kind, payload, model_version, status, created_at
            )
            values (
                cast(:id as uuid), cast(:post_id as uuid), :user_id, :workspace_id, 'full_bundle',
                cast(:payload as jsonb), :model_version, 'draft', now()
            )
            """
        ),
        {
            "id": pid,
            "post_id": post_id,
            "user_id": identity["user_id"],
            "workspace_id": identity["workspace_id"],
            "payload": json.dumps(bundle),
            "model_version": bundle.get("model_version", "heuristic-v1"),
        },
    )
    db.commit()
    return {"proposal_id": pid, **bundle}


class CreatePromotionBody(BaseModel):
    platform: str = Field(min_length=3, max_length=12)
    budget: float = Field(gt=0, le=100_000)
    objective: str | None = Field(default=None, max_length=64)


@router.post("/posts/{post_id}/promotions")
def create_promotion(
    post_id: str,
    body: CreatePromotionBody,
    request: Request,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, convert_underscores=False, alias="Idempotency-Key"),
) -> dict[str, Any]:
    identity = _current_user(request, db)
    post = _require_post(db, post_id, identity)
    if str(post["status"]).lower() != "published":
        raise HTTPException(status_code=400, detail="Post must be published")

    platform = body.platform.strip().lower()
    idem = (idempotency_key or "").strip() or str(uuid.uuid4())

    if platform == "meta":
        row_id = str(uuid.uuid4())
        try:
            created = create_meta_boost(
                db,
                user_id=identity["user_id"],
                workspace_id=identity["workspace_id"],
                post_id=post_id,
                budget=body.budget,
            )
        except ValueError as exc:
            code = str(exc)
            if code == "no_meta_target":
                raise HTTPException(status_code=400, detail="No successful Meta target for this post") from exc
            if code == "no_meta_token":
                raise HTTPException(status_code=400, detail="No active Meta account") from exc
            if code in {"no_ad_accounts", "no_ad_account_id"}:
                raise HTTPException(status_code=400, detail="No Meta ad account visible for this token") from exc
            raise HTTPException(status_code=400, detail="Could not create promotion") from exc
        except Exception:
            failed_boost_row(
                db,
                row_id=row_id,
                user_id=identity["user_id"],
                workspace_id=identity["workspace_id"],
                post_id=post_id,
                budget=body.budget,
            )
            db.commit()
            logger.exception("campaign-mgmt meta boost failed")
            raise HTTPException(status_code=400, detail="Could not create boost campaign.") from None

        insert_ads_campaign_row(
            db,
            row_id=row_id,
            user_id=identity["user_id"],
            workspace_id=identity["workspace_id"],
            post_id=post_id,
            platform="meta",
            budget=body.budget,
            status="created",
            lifecycle="paused",
            campaign_id=created["campaign_id"],
            ad_id=created["ad_id"],
            adset_id=created["adset_id"],
            creative_id=created["creative_id"],
            name=f"boost-{post_id[:8]}",
            objective=body.objective or "OUTCOME_AWARENESS",
            platform_data={"idempotency_key": idem},
        )
        db.commit()
        return {"ok": True, "promotion_id": row_id, "platform": "meta", **{k: created[k] for k in ("campaign_id", "ad_id", "adset_id", "creative_id") if k in created}}

    if platform == "linkedin":
        try:
            create_boost_from_share_stub(share_urn="", daily_budget_units=body.budget, objective=body.objective or "ENGAGEMENT")
        except LinkedInAdsNotConfiguredError as exc:
            raise HTTPException(status_code=501, detail=str(exc)) from exc

    raise HTTPException(status_code=400, detail="Unsupported platform")


class LifecycleBody(BaseModel):
    action: str = Field(min_length=3, max_length=16)


@router.post("/promotions/{promotion_id}/lifecycle")
def promotion_lifecycle(
    promotion_id: str,
    body: LifecycleBody,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    identity = _current_user(request, db)
    action = body.action.strip().lower()
    if action not in {"pause", "resume", "archive"}:
        raise HTTPException(status_code=400, detail="action must be pause, resume, or archive")
    row = db.execute(
        text(
            """
            select *
            from ads_campaigns
            where id = cast(:id as uuid)
              and user_id = :user_id
              and workspace_id = :workspace_id
            """
        ),
        {"id": promotion_id, "user_id": identity["user_id"], "workspace_id": identity["workspace_id"]},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Promotion not found")
    r = dict(row)
    if str(r.get("platform")) != "meta":
        raise HTTPException(status_code=501, detail="Lifecycle control implemented for Meta in this build")
    lifecycle_map = {"pause": "paused", "resume": "active", "archive": "archived"}
    target = lifecycle_map[action]
    try:
        apply_meta_lifecycle(db, user_id=identity["user_id"], workspace_id=identity["workspace_id"], promotion_row=r, lifecycle=target)
    except Exception:
        logger.exception("promotion lifecycle failed")
        raise HTTPException(status_code=502, detail="Meta API error") from None
    st = "archived" if target == "archived" else "created"
    db.execute(
        text(
            """
            update ads_campaigns
            set lifecycle = :lc, status = :st, updated_at = now()
            where id = cast(:id as uuid)
            """
        ),
        {"id": promotion_id, "lc": target, "st": st},
    )
    db.commit()
    return {"ok": True, "lifecycle": target}


@router.post("/promotions/{promotion_id}/duplicate")
def duplicate_promotion(promotion_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    row = db.execute(
        text(
            """
            select post_id, budget, platform
            from ads_campaigns
            where id = cast(:id as uuid)
              and user_id = :user_id
              and workspace_id = :workspace_id
            """
        ),
        {"id": promotion_id, "user_id": identity["user_id"], "workspace_id": identity["workspace_id"]},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Promotion not found")
    post_id = str(row["post_id"])
    if str(row["platform"]) != "meta":
        raise HTTPException(status_code=501, detail="Duplicate implemented for Meta")
    budget = float(row["budget"] or 10)
    new_id = str(uuid.uuid4())
    try:
        created = create_meta_boost(
            db,
            user_id=identity["user_id"],
            workspace_id=identity["workspace_id"],
            post_id=post_id,
            budget=budget,
            name_prefix=f"dup-{promotion_id[:6]}",
        )
    except Exception:
        logger.exception("duplicate meta boost failed")
        raise HTTPException(status_code=400, detail="Duplicate failed") from None

    insert_ads_campaign_row(
        db,
        row_id=new_id,
        user_id=identity["user_id"],
        workspace_id=identity["workspace_id"],
        post_id=post_id,
        platform="meta",
        budget=budget,
        status="created",
        lifecycle="paused",
        campaign_id=created["campaign_id"],
        ad_id=created["ad_id"],
        adset_id=created["adset_id"],
        creative_id=created["creative_id"],
        name=f"dup-{promotion_id[:6]}",
        platform_data={"duplicated_from": promotion_id},
    )
    db.commit()
    return {"ok": True, "promotion_id": new_id, "campaign_id": created["campaign_id"], "ad_id": created["ad_id"]}


@router.post("/promotions/{promotion_id}/analytics/sync")
def sync_promotion_analytics(promotion_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    row = db.execute(
        text(
            """
            select id, post_id, platform, campaign_id, ad_id
            from ads_campaigns
            where id = cast(:id as uuid)
              and user_id = :user_id
              and workspace_id = :workspace_id
            """
        ),
        {"id": promotion_id, "user_id": identity["user_id"], "workspace_id": identity["workspace_id"]},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Promotion not found")
    r = dict(row)
    if str(r.get("platform")) != "meta" or not r.get("ad_id"):
        return {"ok": True, "snapshot": None, "message": "No Meta ad id to sync"}

    tok = meta_access_token_for_workspace(db, identity["user_id"], identity["workspace_id"])
    if not tok:
        raise HTTPException(status_code=400, detail="No Meta token")
    cfg = fresh_settings()
    ins = ads_service.fetch_object_insights(
        access_token=tok,
        object_id=str(r["ad_id"]),
        api_version=cfg.meta_graph_api_version,
        timeout_seconds=cfg.request_timeout_seconds,
    )
    impressions = int(float(ins.get("impressions") or 0))
    clicks = int(float(ins.get("clicks") or 0))
    spend = float(ins.get("spend") or 0)
    reach = int(float(ins.get("reach") or 0))
    spend_cents = int(round(spend * 100))
    ctr = (clicks / impressions) if impressions > 0 else None
    cpc_cents = int(round(spend_cents / clicks)) if clicks > 0 else None
    today = date.today()
    db.execute(
        text(
            """
            insert into campaign_analytics_snapshots (
                workspace_id, user_id, entity_type, entity_id, post_id, platform, metric_date, granularity,
                reach, impressions, engagements, clicks, spend_cents, ctr, cpc_cents, raw, created_at
            )
            values (
                :workspace_id, :user_id, 'promotion', :entity_id, cast(:post_id as uuid), 'meta', :metric_date, 'day',
                :reach, :impressions, null, :clicks, :spend_cents, :ctr, :cpc_cents, cast(:raw as jsonb), now()
            )
            on conflict (workspace_id, entity_type, entity_id, platform, metric_date, granularity)
            do update set
                reach = excluded.reach,
                impressions = excluded.impressions,
                clicks = excluded.clicks,
                spend_cents = excluded.spend_cents,
                ctr = excluded.ctr,
                cpc_cents = excluded.cpc_cents,
                raw = excluded.raw,
                created_at = now()
            """
        ),
        {
            "workspace_id": identity["workspace_id"],
            "user_id": identity["user_id"],
            "entity_id": promotion_id,
            "post_id": str(r["post_id"]),
            "metric_date": today,
            "reach": reach,
            "impressions": impressions,
            "clicks": clicks,
            "spend_cents": spend_cents,
            "ctr": ctr,
            "cpc_cents": cpc_cents,
            "raw": json.dumps(ins),
        },
    )
    db.commit()
    return {
        "ok": True,
        "snapshot": {
            "reach": reach,
            "impressions": impressions,
            "clicks": clicks,
            "spend": spend,
            "ctr": ctr,
            "cpc": (cpc_cents or 0) / 100.0 if cpc_cents else None,
        },
    }


@router.get("/posts/{post_id}/analytics")
def post_analytics(post_id: str, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    identity = _current_user(request, db)
    _require_post(db, post_id, identity)
    promos = _promotions_for_post(db, post_id)
    prom_ids = [str(p["id"]) for p in promos]
    if not prom_ids:
        return {"series": [], "totals": {}}
    placeholders = ",".join([f":p{i}" for i in range(len(prom_ids))])
    params: dict[str, Any] = {"ws": identity["workspace_id"]}
    for i, pid in enumerate(prom_ids):
        params[f"p{i}"] = pid
    rows = db.execute(
        text(
            f"""
            select metric_date, sum(coalesce(impressions,0)) as impressions,
                   sum(coalesce(clicks,0)) as clicks,
                   sum(coalesce(spend_cents,0)) as spend_cents,
                   sum(coalesce(reach,0)) as reach
            from campaign_analytics_snapshots
            where workspace_id = :ws
              and entity_type = 'promotion'
              and entity_id in ({placeholders})
            group by metric_date
            order by metric_date asc
            """
        ),
        params,
    ).mappings().all()
    series = []
    for row in rows:
        imp = int(row["impressions"] or 0)
        clk = int(row["clicks"] or 0)
        spend = int(row["spend_cents"] or 0)
        series.append(
            {
                "date": row["metric_date"].isoformat(),
                "impressions": imp,
                "clicks": clk,
                "spend": spend / 100.0,
                "ctr": (clk / imp) if imp else None,
                "cpc": (spend / 100.0 / clk) if clk else None,
            }
        )
    return {"series": series}
