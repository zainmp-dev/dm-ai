from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from config import fresh_settings
from utils.http_client import request_json
from utils.token_crypto import decrypt_secret, encrypt_secret


def upsert_social_account(
    db: Session,
    *,
    user_id: str,
    workspace_id: str,
    platform: str,
    account_id: str,
    account_name: str,
    access_token: str,
    refresh_token: str | None = None,
    expires_at: datetime | None = None,
    meta_page_id: str | None = None,
    meta_page_token: str | None = None,
    meta_ig_id: str | None = None,
    is_active: bool = True,
) -> None:
    enc_access = encrypt_secret(access_token)
    enc_refresh = encrypt_secret(refresh_token)
    enc_page = encrypt_secret(meta_page_token)
    db.execute(
        text(
            """
            insert into social_accounts (
                id, user_id, workspace_id, platform, account_id, account_name,
                access_token, refresh_token, expires_at,
                meta_page_id, meta_page_token, meta_ig_id, is_active, updated_at
            )
            values (
                cast(:id as uuid), :user_id, :workspace_id, :platform, :account_id, :account_name,
                :access_token, :refresh_token, :expires_at,
                :meta_page_id, :meta_page_token, :meta_ig_id, :is_active, now()
            )
            on conflict (user_id, workspace_id, platform, account_id) do update
            set
                account_name = excluded.account_name,
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at,
                meta_page_id = excluded.meta_page_id,
                meta_page_token = excluded.meta_page_token,
                meta_ig_id = excluded.meta_ig_id,
                is_active = excluded.is_active,
                updated_at = now()
            """
        ),
        {
            "user_id": user_id,
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "platform": platform,
            "account_id": account_id,
            "account_name": account_name[:300],
            "access_token": enc_access,
            "refresh_token": enc_refresh,
            "expires_at": expires_at,
            "meta_page_id": meta_page_id,
            "meta_page_token": enc_page,
            "meta_ig_id": meta_ig_id,
            "is_active": is_active,
        },
    )


def list_social_accounts(db: Session, *, user_id: str, workspace_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            select id, platform, account_id, account_name, meta_page_id, meta_ig_id, is_active, expires_at, updated_at
            from social_accounts
            where user_id = :user_id and workspace_id = :workspace_id
            order by updated_at desc
            """
        ),
        {"user_id": user_id, "workspace_id": workspace_id},
    ).mappings()
    return [dict(r) for r in rows]


def get_social_account_for_publish(
    db: Session,
    *,
    social_account_id: str,
    user_id: str,
    workspace_id: str,
    platform: str,
) -> dict[str, Any] | None:
    row = db.execute(
        text(
            """
            select *
            from social_accounts
            where id = cast(:social_account_id as uuid)
              and user_id = :user_id
              and workspace_id = :workspace_id
              and platform = :platform
              and coalesce(account_id, '') <> ''
              and is_active = true
            """
        ),
        {
            "social_account_id": social_account_id,
            "user_id": user_id,
            "workspace_id": workspace_id,
            "platform": platform,
        },
    ).mappings().first()
    if not row:
        return None
    account = dict(row)
    account["access_token"] = decrypt_secret(account.get("access_token"))
    account["refresh_token"] = decrypt_secret(account.get("refresh_token"))
    account["meta_page_token"] = decrypt_secret(account.get("meta_page_token"))
    return account


def mark_social_account_inactive(db: Session, *, social_account_id: str, user_id: str, workspace_id: str) -> None:
    db.execute(
        text(
            """
            update social_accounts
            set is_active = false, updated_at = now()
            where id = cast(:social_account_id as uuid)
              and user_id = :user_id
              and workspace_id = :workspace_id
            """
        ),
        {"social_account_id": social_account_id, "user_id": user_id, "workspace_id": workspace_id},
    )


def ensure_token_valid(db: Session, account: dict[str, Any]) -> dict[str, Any] | None:
    expires_at = account.get("expires_at")
    if not isinstance(expires_at, datetime):
        return account
    if expires_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        return account
    refresh = str(account.get("refresh_token") or "").strip()
    if not refresh:
        mark_social_account_inactive(
            db,
            social_account_id=str(account["id"]),
            user_id=str(account["user_id"]),
            workspace_id=str(account["workspace_id"]),
        )
        return None

    # LinkedIn refresh grant may be unavailable depending on app product setup.
    if str(account.get("platform")) != "linkedin":
        return account
    s = fresh_settings()
    if not s.linkedin_client_id or not s.linkedin_client_secret:
        return account
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh,
        "client_id": s.linkedin_client_id,
        "client_secret": s.linkedin_client_secret,
    }
    try:
        data = request_json(
            "POST",
            "https://www.linkedin.com/oauth/v2/accessToken",
            timeout_seconds=s.request_timeout_seconds,
            log_context="linkedin refresh token",
            data=payload,
        )
    except Exception:
        mark_social_account_inactive(
            db,
            social_account_id=str(account["id"]),
            user_id=str(account["user_id"]),
            workspace_id=str(account["workspace_id"]),
        )
        return None
    new_access_token = str(data.get("access_token") or "").strip()
    if not new_access_token:
        return account
    expires_in = int(data.get("expires_in") or 3600)
    new_refresh = str(data.get("refresh_token") or refresh).strip()
    new_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    upsert_social_account(
        db,
        user_id=str(account["user_id"]),
        workspace_id=str(account["workspace_id"]),
        platform="linkedin",
        account_id=str(account["account_id"]),
        account_name=str(account.get("account_name") or ""),
        access_token=new_access_token,
        refresh_token=new_refresh,
        expires_at=new_expires_at,
        meta_page_id=account.get("meta_page_id"),
        meta_page_token=account.get("meta_page_token"),
        meta_ig_id=account.get("meta_ig_id"),
        is_active=True,
    )
    account["access_token"] = new_access_token
    account["refresh_token"] = new_refresh
    account["expires_at"] = new_expires_at
    return account


def run_token_maintenance(db: Session) -> int:
    rows = db.execute(
        text(
            """
            select *
            from social_accounts
            where is_active = true and expires_at is not null and expires_at <= now() + interval '5 minutes'
            order by updated_at asc
            """
        )
    ).mappings().all()
    touched = 0
    for row in rows:
        account = dict(row)
        ensure_token_valid(db, account)
        touched += 1
    # Periodic validity checks (best-effort) to proactively disable dead tokens.
    active_rows = db.execute(
        text("select id, user_id, workspace_id, platform, access_token from social_accounts where is_active = true limit 100")
    ).mappings().all()
    for row in active_rows:
        platform = str(row["platform"])
        token = decrypt_secret(str(row.get("access_token") or ""))
        if not token:
            continue
        try:
            if platform == "linkedin":
                request_json(
                    "GET",
                    "https://api.linkedin.com/v2/userinfo",
                    timeout_seconds=fresh_settings().request_timeout_seconds,
                    log_context="linkedin token health",
                    headers={"Authorization": f"Bearer {token}"},
                )
            elif platform == "meta":
                request_json(
                    "GET",
                    "https://graph.facebook.com/v22.0/me",
                    timeout_seconds=fresh_settings().request_timeout_seconds,
                    log_context="meta token health",
                    params={"access_token": token},
                )
        except Exception:
            mark_social_account_inactive(
                db,
                social_account_id=str(row["id"]),
                user_id=str(row["user_id"]),
                workspace_id=str(row["workspace_id"]),
            )
    db.commit()
    return touched
