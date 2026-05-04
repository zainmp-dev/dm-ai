from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

from sqlalchemy import text
from sqlalchemy.orm import Session

from config import fresh_settings
from services.token_service import upsert_social_account
from utils.http_client import request_json
from utils.state_signing import encode_state, new_nonce, verify_state
from utils.validators import require_https_redirect_uri

logger = logging.getLogger(__name__)
LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
OAUTH_STATE_TTL_SECONDS = 900


def _normalize_origin(origin: str) -> str:
    return (origin or "").strip().rstrip("/")


def _redirect_uri_from_origin(origin: str, callback_path: str) -> str:
    base = _normalize_origin(origin)
    path = "/" + callback_path.lstrip("/")
    if not base:
        return ""
    return f"{base}{path}"


def _resolved_linkedin_redirect_uri(*, app_origin: str | None = None) -> str:
    s = fresh_settings()
    explicit = (s.linkedin_redirect_uri or "").strip()
    if explicit:
        expected = explicit
        redirect_uri = require_https_redirect_uri(explicit, field_name="LINKEDIN_REDIRECT_URI")
        if redirect_uri != expected:
            raise ValueError(
                "Redirect URI mismatch detected: parsed LINKEDIN_REDIRECT_URI does not match configured value"
            )
        return redirect_uri
    fallback = (
        _redirect_uri_from_origin(app_origin or "", "/linkedin/callback")
        or _redirect_uri_from_origin(s.public_app_origin, "/linkedin/callback")
    )
    if not fallback:
        raise ValueError(
            "LINKEDIN_REDIRECT_URI is required, or set FLOWPILOT_PUBLIC_ORIGIN/NEXT_PUBLIC_SITE_URL for automatic callback URLs"
        )
    return require_https_redirect_uri(fallback, field_name="LINKEDIN_REDIRECT_URI")


def _resolved_meta_redirect_uri(*, app_origin: str | None = None) -> str:
    s = fresh_settings()
    explicit = (s.meta_redirect_uri or "").strip()
    if explicit:
        return require_https_redirect_uri(explicit, field_name="META_REDIRECT_URI")
    fallback = (
        _redirect_uri_from_origin(app_origin or "", "/auth/meta/callback")
        or _redirect_uri_from_origin(s.public_app_origin, "/auth/meta/callback")
    )
    if not fallback:
        raise ValueError(
            "META_REDIRECT_URI is required, or set FLOWPILOT_PUBLIC_ORIGIN/NEXT_PUBLIC_SITE_URL for automatic callback URLs"
        )
    return require_https_redirect_uri(fallback, field_name="META_REDIRECT_URI")


def _meta_graph_version_label(s: Any) -> str:
    v = (getattr(s, "meta_graph_api_version", None) or "v22.0").strip() or "v22.0"
    if not v.startswith("v"):
        v = f"v{v}"
    return v


def _meta_graph_api_base(s: Any) -> str:
    return f"https://graph.facebook.com/{_meta_graph_version_label(s)}"


def _normalize_meta_app_id(raw: str) -> str:
    """Meta App IDs are numeric (typically 15–17 digits). Trim quotes/spaces; allow pasted text with a digit run."""
    s = (raw or "").strip().strip('"').strip("'")
    compact = "".join(s.split())
    if compact.isdigit() and 10 <= len(compact) <= 20:
        return compact
    m = re.search(r"\d{10,20}", s)
    if m:
        return m.group(0)
    return compact


def _normalize_meta_app_secret(raw: str) -> str:
    """Strip quotes, CR/LF, and invisible characters often pasted from the Meta dashboard."""
    s = (raw or "").strip().strip('"').strip("'")
    s = s.replace("\ufeff", "").replace("\r", "").replace("\n", "")
    return "".join(ch for ch in s if ch.isprintable())


def _facebook_oauth_error_hint(exc: RuntimeError) -> str:
    """Pull a short error.message from Facebook JSON embedded in our RuntimeError text."""
    raw = str(exc)
    m = re.search(r'["\']message["\']\s*:\s*["\']([^"\'\\]{1,200})', raw)
    if m:
        return f'Facebook reports: "{m.group(1)}"'
    return ""


def _preflight_meta_app_credentials(*, app_id: str, s: Any) -> None:
    """
    Ask Facebook for an app access token before sending the user to the OAuth dialog.
    Catches wrong App ID / secret early (same root cause as PLATFORM__INVALID_APP_ID on www.facebook.com).
    """
    secret = _normalize_meta_app_secret(s.meta_app_secret or "")
    if not secret:
        raise ValueError(
            "Meta needs an App Secret on the server. Add META_APP_SECRET for the same app as META_APP_ID, restart the API, then try again."
        )
    base = _meta_graph_api_base(s)
    timeout = min(int(getattr(s, "request_timeout_seconds", None) or 30), 20)
    token_params = {"client_id": app_id, "client_secret": secret, "grant_type": "client_credentials"}
    payload: dict[str, Any] | None = None
    last_exc: RuntimeError | None = None
    for method, kwargs in (
        # POST avoids secrets in query strings (proxies, logs); GET is Meta’s common example — try both.
        ("POST", {"data": token_params}),
        ("GET", {"params": token_params}),
    ):
        try:
            payload = request_json(
                method,
                f"{base}/oauth/access_token",
                timeout_seconds=timeout,
                log_context="Meta app credentials check",
                **kwargs,
            )
            break
        except RuntimeError as exc:
            last_exc = exc
            payload = None
    if payload is None:
        assert last_exc is not None
        exc = last_exc
        logger.warning("Meta app credentials preflight failed: %s", exc)
        fb = _facebook_oauth_error_hint(exc)
        raise ValueError(
            "Meta App ID or App Secret was rejected by Facebook (same as “Invalid App ID” in the browser). "
            + (f"{fb} " if fb else "")
            + "In developers.facebook.com open your app → App settings: copy the numeric App ID and the current App secret "
            "(click “Show” or reset the secret if you are unsure). Put them in META_APP_ID and META_APP_SECRET in backend/.env, "
            "restart the API, then try Connect again."
        ) from last_exc
    access = str((payload or {}).get("access_token") or "").strip()
    if not access:
        raise ValueError(
            "Facebook returned no app token. Check that META_APP_ID and META_APP_SECRET belong to the same Meta app, then restart the API."
        )


def _store_nonce(db: Session, *, nonce: str, user_id: str, workspace_id: str, ttl_seconds: int = 900) -> None:
    db.execute(
        text(
            """
            insert into flowpilot_oauth_nonce (nonce, user_id, workspace_id, expires_at, used_at, created_at)
            values (:nonce, :user_id, :workspace_id, now() + (:ttl || ' seconds')::interval, null, now())
            on conflict (nonce) do update
            set user_id = excluded.user_id, workspace_id = excluded.workspace_id, expires_at = excluded.expires_at, used_at = null
            """
        ),
        {"nonce": nonce, "user_id": user_id, "workspace_id": workspace_id, "ttl": str(ttl_seconds)},
    )


def _consume_nonce(db: Session, *, nonce: str, user_id: str, workspace_id: str) -> bool:
    row = db.execute(
        text(
            """
            delete from flowpilot_oauth_nonce
            where nonce = :nonce
              and user_id = :user_id
              and workspace_id = :workspace_id
              and used_at is null
              and expires_at > now()
            returning nonce
            """
        ),
        {"nonce": nonce, "user_id": user_id, "workspace_id": workspace_id},
    ).first()
    return row is not None


def create_oauth_state(db: Session, *, user_id: str, workspace_id: str) -> str:
    s = fresh_settings()
    if not s.oauth_state_secret:
        raise ValueError("OAUTH_STATE_SECRET is required")
    nonce = new_nonce()
    _store_nonce(db, nonce=nonce, user_id=user_id, workspace_id=workspace_id, ttl_seconds=OAUTH_STATE_TTL_SECONDS)
    payload = {"user_id": user_id, "workspace_id": workspace_id, "nonce": nonce, "ts": int(datetime.now(timezone.utc).timestamp())}
    return encode_state(payload, s.oauth_state_secret)


def parse_and_verify_state(db: Session, state: str) -> dict[str, str]:
    s = fresh_settings()
    if not s.oauth_state_secret:
        raise ValueError("OAUTH_STATE_SECRET is required")
    payload = verify_state(state, s.oauth_state_secret, max_age_seconds=OAUTH_STATE_TTL_SECONDS)
    user_id = str(payload.get("user_id") or "")
    workspace_id = str(payload.get("workspace_id") or "")
    nonce = str(payload.get("nonce") or "")
    if not user_id or not workspace_id or not nonce:
        raise ValueError("invalid state payload")
    if not _consume_nonce(db, nonce=nonce, user_id=user_id, workspace_id=workspace_id):
        raise ValueError("invalid or reused state nonce")
    return {"user_id": user_id, "workspace_id": workspace_id}


def linkedin_connect_url(db: Session, *, user_id: str, workspace_id: str, app_origin: str | None = None) -> str:
    s = fresh_settings()
    if not s.linkedin_client_id:
        raise ValueError("LinkedIn OAuth is not configured")
    redirect_uri = _resolved_linkedin_redirect_uri(app_origin=app_origin)
    state = create_oauth_state(db, user_id=user_id, workspace_id=workspace_id)
    params = {
        "response_type": "code",
        "client_id": s.linkedin_client_id,
        "redirect_uri": redirect_uri,
        "scope": "openid profile email w_member_social",
        "state": state,
    }
    auth_url = f"{LINKEDIN_AUTH_URL}?{urlencode(params)}"
    logger.info("LinkedIn OAuth redirect_uri=%s", redirect_uri)
    logger.info("LinkedIn OAuth auth_url=%s", f"{LINKEDIN_AUTH_URL}?{urlencode({**params, 'state': '[REDACTED]'})}")
    return auth_url


def linkedin_callback(db: Session, *, code: str, state: str, app_origin: str | None = None) -> dict[str, Any]:
    s = fresh_settings()
    ids = parse_and_verify_state(db, state)
    redirect_uri = _resolved_linkedin_redirect_uri(app_origin=app_origin)
    logger.info("LinkedIn token exchange redirect_uri=%s", redirect_uri)
    token = request_json(
        "POST",
        LINKEDIN_TOKEN_URL,
        timeout_seconds=s.request_timeout_seconds,
        log_context="linkedin access token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": s.linkedin_client_id,
            "client_secret": s.linkedin_client_secret,
        },
    )
    access_token = str(token.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("LinkedIn callback failed: missing access token")
    expires_in = int(token.get("expires_in") or 3600)
    refresh_token = str(token.get("refresh_token") or "").strip() or None
    profile = request_json(
        "GET",
        "https://api.linkedin.com/v2/userinfo",
        timeout_seconds=s.request_timeout_seconds,
        log_context="linkedin userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    account_id = str(profile.get("sub") or "").strip()
    account_name = str(profile.get("name") or profile.get("given_name") or "LinkedIn Account").strip()
    if not account_id:
        raise RuntimeError("LinkedIn callback failed: userinfo missing account id")
    upsert_social_account(
        db,
        user_id=ids["user_id"],
        workspace_id=ids["workspace_id"],
        platform="linkedin",
        account_id=account_id,
        account_name=account_name,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
    )
    account_url: str | None = None
    vanity = ""
    try:
        me = request_json(
            "GET",
            "https://api.linkedin.com/v2/me?projection=(id,vanityName)",
            timeout_seconds=s.request_timeout_seconds,
            log_context="linkedin me vanity",
            headers={
                "Authorization": f"Bearer {access_token}",
                "LinkedIn-Version": "202405",
                "X-Restli-Protocol-Version": "2.0.0",
            },
        )
        vanity = str(me.get("vanityName") or "").strip()
        if vanity:
            account_url = f"https://www.linkedin.com/in/{vanity}/"
    except Exception:
        logger.warning("LinkedIn /v2/me (vanity) unavailable; account link omitted", exc_info=True)
    handle = vanity or account_id
    return {
        **ids,
        "account_name": account_name,
        "account_handle": handle,
        "account_url": account_url,
    }


def meta_connect_url(db: Session, *, user_id: str, workspace_id: str, app_origin: str | None = None) -> str:
    s = fresh_settings()
    if not s.meta_app_id:
        raise ValueError("Meta OAuth is not configured")
    app_id = _normalize_meta_app_id(s.meta_app_id or "")
    if not app_id.isdigit() or not (10 <= len(app_id) <= 20):
        raise ValueError(
            "Meta OAuth app id is invalid. In backend/.env set META_APP_ID (or FACEBOOK_APP_ID) to the numeric "
            "App ID from developers.facebook.com → App settings (10–20 digits only, not the app name or secret)."
        )
    _preflight_meta_app_credentials(app_id=app_id, s=s)
    redirect_uri = _resolved_meta_redirect_uri(app_origin=app_origin)
    state = create_oauth_state(db, user_id=user_id, workspace_id=workspace_id)
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "scope": "pages_show_list,pages_manage_posts,instagram_basic,instagram_content_publish",
        "response_type": "code",
        "state": state,
    }
    ver = _meta_graph_version_label(s)
    return f"https://www.facebook.com/{ver}/dialog/oauth?{urlencode(params)}"


def meta_callback(db: Session, *, code: str, state: str, app_origin: str | None = None) -> dict[str, Any]:
    s = fresh_settings()
    ids = parse_and_verify_state(db, state)
    redirect_uri = _resolved_meta_redirect_uri(app_origin=app_origin)
    graph_base = _meta_graph_api_base(s)
    app_id = _normalize_meta_app_id(s.meta_app_id or "")
    short = request_json(
        "GET",
        f"{graph_base}/oauth/access_token",
        timeout_seconds=s.request_timeout_seconds,
        log_context="meta oauth token",
        params={
            "client_id": app_id,
            "client_secret": s.meta_app_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        },
    )
    token = str(short.get("access_token") or "").strip()
    if not token:
        raise RuntimeError("Meta callback failed: missing access token")
    long_lived = request_json(
        "GET",
        f"{graph_base}/oauth/access_token",
        timeout_seconds=s.request_timeout_seconds,
        log_context="meta long-lived token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": s.meta_app_secret,
            "fb_exchange_token": token,
        },
    )
    user_token = str(long_lived.get("access_token") or token)
    user_expiry = datetime.now(timezone.utc) + timedelta(seconds=int(long_lived.get("expires_in") or 3600))
    pages = request_json(
        "GET",
        f"{graph_base}/me/accounts",
        timeout_seconds=s.request_timeout_seconds,
        log_context="meta pages list",
        params={"access_token": user_token, "fields": "id,name,access_token,instagram_business_account{id}"},
    )
    page_rows = pages.get("data") if isinstance(pages.get("data"), list) else []
    primary_name = "Meta"
    primary_handle = ""
    primary_url: str | None = None
    for page in page_rows:
        if not isinstance(page, dict):
            continue
        page_id = str(page.get("id") or "").strip()
        if not page_id:
            continue
        page_token = str(page.get("access_token") or "").strip()
        page_name = str(page.get("name") or f"Meta page {page_id}").strip()
        ig_id = ""
        ig_obj = page.get("instagram_business_account")
        if isinstance(ig_obj, dict):
            ig_id = str(ig_obj.get("id") or "").strip()
        upsert_social_account(
            db,
            user_id=ids["user_id"],
            workspace_id=ids["workspace_id"],
            platform="meta",
            account_id=page_id,
            account_name=page_name,
            access_token=user_token,
            refresh_token=None,
            expires_at=user_expiry,
            meta_page_id=page_id,
            meta_page_token=page_token,
            meta_ig_id=ig_id or None,
        )
        if not primary_handle:
            primary_name = page_name
            primary_handle = page_id
            primary_url = f"https://www.facebook.com/{page_id}"
    return {
        "user_id": ids["user_id"],
        "workspace_id": ids["workspace_id"],
        "connected_pages": len(page_rows),
        "account_name": primary_name,
        "account_handle": primary_handle or "connected",
        "account_url": primary_url,
    }
