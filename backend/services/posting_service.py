from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from config import fresh_settings
from publisher import PublishResult, resolve_publish_media_url
from services.token_service import ensure_token_valid, get_default_active_social_account, get_social_account_for_publish
from utils.http_client import request_json

logger = logging.getLogger(__name__)


def _retry_json(method: str, url: str, *, timeout_seconds: int, log_context: str, attempts: int = 3, **kwargs: Any) -> dict[str, Any]:
    delay = 1.0
    for i in range(attempts):
        try:
            return request_json(method, url, timeout_seconds=timeout_seconds, log_context=log_context, **kwargs)
        except RuntimeError as exc:
            logger.warning("%s attempt %s/%s failed: %s", log_context, i + 1, attempts, str(exc)[:220])
            if i == attempts - 1:
                raise
            time.sleep(delay)
            delay *= 2
    raise RuntimeError(f"{log_context} failed")


def _publish_to_linkedin(*, content: str, media_url: str | None, access_token: str, author_urn: str, timeout_seconds: int) -> dict[str, Any]:
    payload = {
        "author": author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": content[:3000]},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    if media_url:
        payload["specificContent"]["com.linkedin.ugc.ShareContent"]["shareMediaCategory"] = "ARTICLE"
        payload["specificContent"]["com.linkedin.ugc.ShareContent"]["media"] = [{"status": "READY", "originalUrl": media_url}]
    return _retry_json(
        "POST",
        "https://api.linkedin.com/v2/ugcPosts",
        timeout_seconds=timeout_seconds,
        log_context="linkedin publish",
        headers={
            "Authorization": f"Bearer {access_token}",
            "LinkedIn-Version": "202405",
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
        },
        json=payload,
    )


def _resolve_pending_linkedin_account(db: Session, *, account: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    account_id = str(account.get("account_id") or "").strip()
    if not account_id.startswith("pending-"):
        return account
    token = str(account.get("access_token") or "").strip()
    if not token:
        return account
    try:
        me = _retry_json(
            "GET",
            "https://api.linkedin.com/v2/me",
            timeout_seconds=timeout_seconds,
            log_context="linkedin resolve pending profile",
            headers={
                "Authorization": f"Bearer {token}",
                "LinkedIn-Version": "202405",
                "X-Restli-Protocol-Version": "2.0.0",
            },
        )
    except RuntimeError as exc:
        # Keep account usable for reconnect cycle; do not hard fail here.
        logger.warning("Pending LinkedIn profile resolution failed: %s", str(exc)[:220])
        return account
    resolved_id = str(me.get("id") or "").strip()
    if not resolved_id:
        return account
    resolved_name = str(
        me.get("localizedFirstName") or me.get("firstName") or account.get("account_name") or "LinkedIn Account"
    ).strip()
    db.execute(
        text(
            """
            update social_accounts
               set account_id = :account_id,
                   account_name = :account_name,
                   updated_at = now()
             where id = cast(:id as uuid)
               and user_id = :user_id
               and workspace_id = :workspace_id
               and platform = 'linkedin'
            """
        ),
        {
            "id": str(account["id"]),
            "user_id": str(account["user_id"]),
            "workspace_id": str(account["workspace_id"]),
            "account_id": resolved_id,
            "account_name": resolved_name[:300],
        },
    )
    account["account_id"] = resolved_id
    account["account_name"] = resolved_name
    return account


def _publish_to_meta_page(*, content: str, page_id: str, page_token: str, timeout_seconds: int) -> dict[str, Any]:
    return _retry_json(
        "POST",
        f"https://graph.facebook.com/v22.0/{page_id}/feed",
        timeout_seconds=timeout_seconds,
        log_context="meta page publish",
        data={"message": content, "access_token": page_token},
    )


def _validate_meta_page_token(*, page_token: str, timeout_seconds: int) -> None:
    s = fresh_settings()
    if not s.meta_app_id or not s.meta_app_secret:
        return
    app_token = f"{s.meta_app_id}|{s.meta_app_secret}"
    info = _retry_json(
        "GET",
        "https://graph.facebook.com/v22.0/debug_token",
        timeout_seconds=timeout_seconds,
        log_context="meta debug token",
        params={"input_token": page_token, "access_token": app_token},
    )
    data = info.get("data") if isinstance(info.get("data"), dict) else {}
    token_type = str(data.get("type") or "").upper()
    is_valid = bool(data.get("is_valid"))
    if not is_valid:
        raise RuntimeError("meta page token is invalid")
    if token_type and token_type != "PAGE":
        raise RuntimeError(f"meta token must be PAGE token, got {token_type}")


def _publish_to_instagram(*, content: str, image_url: str, ig_user_id: str, page_token: str, timeout_seconds: int) -> dict[str, Any]:
    container = _retry_json(
        "POST",
        f"https://graph.facebook.com/v22.0/{ig_user_id}/media",
        timeout_seconds=timeout_seconds,
        log_context="meta instagram media create",
        data={"image_url": image_url, "caption": content[:2200], "access_token": page_token},
    )
    creation_id = str(container.get("id") or "").strip()
    if not creation_id:
        raise RuntimeError("instagram create media failed")
    return _retry_json(
        "POST",
        f"https://graph.facebook.com/v22.0/{ig_user_id}/media_publish",
        timeout_seconds=timeout_seconds,
        log_context="meta instagram media publish",
        data={"creation_id": creation_id, "access_token": page_token},
    )


def publish_post(db: Session, *, post_id: str, user_id: str, workspace_id: str) -> dict[str, Any]:
    s = fresh_settings()
    post = db.execute(
        text(
            """
            update posts
            set status = 'processing', updated_at = now()
            where id = cast(:post_id as uuid)
              and user_id = :user_id
              and workspace_id = :workspace_id
              and status in ('draft', 'scheduled', 'failed')
            returning id, user_id, workspace_id, content, media_url, status
            """
        ),
        {"post_id": post_id, "user_id": user_id, "workspace_id": workspace_id},
    ).mappings().first()
    if not post:
        existing = db.execute(
            text(
                "select status from posts where id = cast(:post_id as uuid) and user_id = :user_id and workspace_id = :workspace_id"
            ),
            {"post_id": post_id, "user_id": user_id, "workspace_id": workspace_id},
        ).mappings().first()
        if not existing:
            raise ValueError("post not found")
        if str(existing["status"]) == "published":
            return {"status": "already_published", "updated_targets": 0}
        if str(existing["status"]) == "processing":
            return {"status": "already_processing", "updated_targets": 0}
        raise ValueError("post is not publishable")
    if str(post["status"]) == "published":
        return {"status": "already_published", "updated_targets": 0}

    targets = db.execute(
        text(
            """
            select id, platform, social_account_id
            from post_targets
            where post_id = cast(:post_id as uuid)
            """
        ),
        {"post_id": post_id},
    ).mappings().all()
    success_count = 0
    for target in targets:
        target_id = str(target["id"])
        platform = str(target["platform"]).strip().lower()
        social_account_id = str(target["social_account_id"])
        try:
            # Multi-tenant rule: tokens must always come from DB rows scoped to this user/workspace.
            account = get_social_account_for_publish(
                db,
                social_account_id=social_account_id,
                user_id=user_id,
                workspace_id=workspace_id,
                platform=platform,
            )
            if not account:
                raise RuntimeError("Please connect your account")
            account = ensure_token_valid(db, account)
            if not account:
                raise RuntimeError("Account inactive or token expired. Please reconnect your account")
            response: dict[str, Any]
            if platform == "linkedin":
                account = _resolve_pending_linkedin_account(
                    db,
                    account=account,
                    timeout_seconds=s.request_timeout_seconds,
                )
                response = _publish_to_linkedin(
                    content=str(post["content"]),
                    media_url=post.get("media_url"),
                    access_token=str(account["access_token"]),
                    author_urn=f"urn:li:person:{account['account_id']}",
                    timeout_seconds=s.request_timeout_seconds,
                )
            elif platform == "meta":
                page_id = str(account.get("meta_page_id") or account.get("account_id") or "").strip()
                page_token = str(account.get("meta_page_token") or "").strip()
                if not page_token:
                    raise RuntimeError("meta page token missing; reconnect required")
                _validate_meta_page_token(page_token=page_token, timeout_seconds=s.request_timeout_seconds)
                ig_id = str(account.get("meta_ig_id") or "").strip()
                if ig_id and post.get("media_url"):
                    response = _publish_to_instagram(
                        content=str(post["content"]),
                        image_url=str(post["media_url"]),
                        ig_user_id=ig_id,
                        page_token=page_token,
                        timeout_seconds=s.request_timeout_seconds,
                    )
                else:
                    response = _publish_to_meta_page(
                        content=str(post["content"]),
                        page_id=page_id,
                        page_token=page_token,
                        timeout_seconds=s.request_timeout_seconds,
                    )
            else:
                raise RuntimeError(f"unsupported platform: {platform}")
            db.execute(
                text("update post_targets set status = 'success', response = cast(:response as jsonb) where id = cast(:id as uuid)"),
                {"id": target_id, "response": json.dumps(response, ensure_ascii=True)},
            )
            success_count += 1
        except Exception as exc:
            logger.exception("Target publish failed for post=%s target=%s platform=%s", post_id, target_id, platform)
            db.execute(
                text("update post_targets set status = 'failed', response = cast(:response as jsonb) where id = cast(:id as uuid)"),
                {"id": target_id, "response": json.dumps({"error": str(exc)[:300]}, ensure_ascii=True)},
            )
    final_status = "published" if success_count == len(targets) and targets else "failed"
    db.execute(
        text("update posts set status = :status, updated_at = now() where id = cast(:id as uuid)"),
        {"id": post_id, "status": final_status},
    )
    db.commit()
    return {"status": final_status, "updated_targets": len(targets), "success_count": success_count}


def run_scheduled_posts(db: Session) -> int:
    rows = db.execute(
        text(
            """
            select id, user_id, workspace_id
            from posts
            where status = 'scheduled' and scheduled_at <= now()
            for update skip locked
            """
        )
    ).mappings().all()
    count = 0
    for row in rows:
        try:
            publish_post(db, post_id=str(row["id"]), user_id=str(row["user_id"]), workspace_id=str(row["workspace_id"]))
            count += 1
        except Exception:
            logger.exception("Scheduled publish failed for post=%s", row["id"])
    return count


def publish_flowpilot_workspace_item(
    db: Session,
    *,
    user_id: str,
    workspace_id: str,
    channel: str,
    content_text: str,
    media_preview: str | None,
) -> PublishResult:
    """
    Publish a single `flowpilot_content` row using OAuth tokens from `social_accounts`
    (same sources as native posts). Used by POST /workspace publish, not the legacy `content` table.
    """
    ch = channel.strip().lower()
    if ch not in {"linkedin", "instagram", "facebook"}:
        return PublishResult(False, f"Unsupported platform: {channel}")

    db_platform = "linkedin" if ch == "linkedin" else "meta"
    account = get_default_active_social_account(db, user_id=user_id, workspace_id=workspace_id, platform=db_platform)
    if not account:
        return PublishResult(False, "Please connect your account")

    refreshed = ensure_token_valid(db, account)
    if not refreshed:
        return PublishResult(False, "Account inactive or token expired. Please reconnect your account")

    s = fresh_settings()
    resolved_media, media_warning = resolve_publish_media_url(media_preview)

    try:
        if ch == "linkedin":
            refreshed = _resolve_pending_linkedin_account(
                db,
                account=refreshed,
                timeout_seconds=s.request_timeout_seconds,
            )
            response = _publish_to_linkedin(
                content=content_text,
                media_url=resolved_media,
                access_token=str(refreshed["access_token"]),
                author_urn=f"urn:li:person:{refreshed['account_id']}",
                timeout_seconds=s.request_timeout_seconds,
            )
            return PublishResult(True, "Published", provider_response=response)

        page_id = str(refreshed.get("meta_page_id") or refreshed.get("account_id") or "").strip()
        page_token = str(refreshed.get("meta_page_token") or "").strip()
        if not page_token:
            return PublishResult(False, "Meta page token missing; reconnect required")
        _validate_meta_page_token(page_token=page_token, timeout_seconds=s.request_timeout_seconds)
        ig_id = str(refreshed.get("meta_ig_id") or "").strip()

        if ch == "instagram":
            if not resolved_media:
                return PublishResult(False, media_warning or "Instagram requires image media with a public HTTPS URL")
            if not ig_id:
                return PublishResult(
                    False,
                    "Instagram needs a linked Instagram Business account. Reconnect Meta in Settings or publish to Facebook.",
                )
            response = _publish_to_instagram(
                content=content_text,
                image_url=resolved_media,
                ig_user_id=ig_id,
                page_token=page_token,
                timeout_seconds=s.request_timeout_seconds,
            )
            return PublishResult(True, "Published", provider_response=response)

        response = _publish_to_meta_page(
            content=content_text,
            page_id=page_id,
            page_token=page_token,
            timeout_seconds=s.request_timeout_seconds,
        )
        return PublishResult(True, "Published", provider_response=response)
    except Exception as exc:
        logger.exception("Flowpilot workspace publish failed channel=%s", ch)
        return PublishResult(False, str(exc)[:800])
