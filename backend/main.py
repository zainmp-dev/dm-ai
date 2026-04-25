"""
FlowPilot API — Supabase/Postgres-backed workspace backend.
"""

from __future__ import annotations

import json
import os
import random
import base64
import hashlib
import re
import time as pytime
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Literal, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    import psycopg2
except Exception:  # noqa: BLE001
    psycopg2 = None

# --- Static pools -----------------------------------------------------------------

COMPETITOR_NAMES = [
    "Vanguard Demand Co.",
    "Northstar Media Group",
    "Echo Social Labs",
    "Meridian Performance",
    "Silverline Creative",
    "Harbor Growth Partners",
    "Catalyst Field Marketing",
    "Brightpath Digital",
    "Signal & Story Studio",
    "Arcadia Revenue Labs",
]

CONTENT_SNIPPETS = [
    "Share a customer win with a measurable outcome and a clear next step for readers.",
    "Break down one experiment from last month and what changed after optimization.",
    "Publish a short checklist teams can apply this week to tighten campaign QA.",
    "Highlight a behind-the-scenes look from planning through reporting handoff.",
    "Summarize a quarterly trend with practical recommendations for busy operators.",
    "Spotlight a partner story that shows how joint campaigns scale pipeline.",
]

LEAD_NAMES = [
    "Alicia Gardner",
    "Ravi Menon",
    "Noah Brooks",
    "Mia Chen",
    "Daniel Ortiz",
    "Priya Kapoor",
    "Sofia Alvarez",
    "Ethan Wright",
    "Hannah Okonkwo",
    "Marcus Bell",
]

DEFAULT_DEMO_NAME = "Jordan Reeves"
DEFAULT_DEMO_EMAIL = "demo@flowpilot.app"
DEFAULT_DEMO_PASSWORD = "flowpilot123"


def _load_local_env() -> None:
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as file:
            for line in file:
                row = line.strip()
                if not row or row.startswith("#") or "=" not in row:
                    continue
                key, value = row.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                # Always apply local .env values so reloads pick up changes reliably.
                if key:
                    os.environ[key] = value
    except Exception:
        return


_load_local_env()
LINKEDIN_ACCESS_TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
LINKEDIN_AUTHOR_URN = os.getenv("LINKEDIN_AUTHOR_URN", "").strip()
LINKEDIN_API_VERSION = os.getenv("LINKEDIN_API_VERSION", "202405").strip()
META_PAGE_ACCESS_TOKEN = os.getenv("META_PAGE_ACCESS_TOKEN", "").strip()
META_FACEBOOK_ACCESS_TOKEN = os.getenv("META_FACEBOOK_ACCESS_TOKEN", "").strip()
META_INSTAGRAM_ACCESS_TOKEN = os.getenv("META_INSTAGRAM_ACCESS_TOKEN", "").strip()
META_PAGE_ID = os.getenv("META_PAGE_ID", "").strip()
META_IG_BUSINESS_ACCOUNT_ID = os.getenv("META_IG_BUSINESS_ACCOUNT_ID", "").strip()
META_GRAPH_API_VERSION = os.getenv("META_GRAPH_API_VERSION", "v22.0").strip()
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "").strip()
CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "flowpilot").strip() or "flowpilot"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini").strip() or "openai/gpt-4o-mini"
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "flowpilot").strip() or "flowpilot"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()


def _refresh_runtime_env() -> None:
    global LINKEDIN_ACCESS_TOKEN, LINKEDIN_AUTHOR_URN, LINKEDIN_API_VERSION
    global META_PAGE_ACCESS_TOKEN, META_FACEBOOK_ACCESS_TOKEN, META_INSTAGRAM_ACCESS_TOKEN
    global META_PAGE_ID, META_IG_BUSINESS_ACCOUNT_ID, META_GRAPH_API_VERSION
    global CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER
    global OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_APP_NAME, DATABASE_URL
    _load_local_env()
    LINKEDIN_ACCESS_TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN", "").strip()
    LINKEDIN_AUTHOR_URN = os.getenv("LINKEDIN_AUTHOR_URN", "").strip()
    LINKEDIN_API_VERSION = os.getenv("LINKEDIN_API_VERSION", "202405").strip()
    META_PAGE_ACCESS_TOKEN = os.getenv("META_PAGE_ACCESS_TOKEN", "").strip()
    META_FACEBOOK_ACCESS_TOKEN = os.getenv("META_FACEBOOK_ACCESS_TOKEN", "").strip()
    META_INSTAGRAM_ACCESS_TOKEN = os.getenv("META_INSTAGRAM_ACCESS_TOKEN", "").strip()
    META_PAGE_ID = os.getenv("META_PAGE_ID", "").strip()
    META_IG_BUSINESS_ACCOUNT_ID = os.getenv("META_IG_BUSINESS_ACCOUNT_ID", "").strip()
    META_GRAPH_API_VERSION = os.getenv("META_GRAPH_API_VERSION", "v22.0").strip()
    CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "").strip()
    CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "").strip()
    CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "flowpilot").strip() or "flowpilot"
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
    OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini").strip() or "openai/gpt-4o-mini"
    OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "flowpilot").strip() or "flowpilot"
    DATABASE_URL = os.getenv("DATABASE_URL", "").strip()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _linkedin_ready() -> bool:
    return bool(LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN)


def _meta_ready() -> bool:
    return bool((_meta_token_usable(_meta_facebook_token()) and META_PAGE_ID) or (_meta_token_usable(_meta_instagram_token()) and META_IG_BUSINESS_ACCOUNT_ID))


def _meta_facebook_token() -> str:
    return META_FACEBOOK_ACCESS_TOKEN or META_PAGE_ACCESS_TOKEN


def _meta_instagram_token() -> str:
    return META_INSTAGRAM_ACCESS_TOKEN or META_PAGE_ACCESS_TOKEN


def _meta_token_usable(token: str) -> bool:
    token_l = token.strip().lower()
    if not token_l:
        return False
    if "paste" in token_l or "your_" in token_l or "..." in token_l:
        return False
    return True


def _cloudinary_ready() -> bool:
    return bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)


def _openrouter_ready() -> bool:
    return bool(OPENROUTER_API_KEY)


def _is_cloudinary_url(url: str) -> bool:
    return "res.cloudinary.com" in url and (not CLOUDINARY_CLOUD_NAME or f"/{CLOUDINARY_CLOUD_NAME}/" in url)


def _cloudinary_signature(params: dict[str, Any]) -> str:
    payload = "&".join(f"{key}={params[key]}" for key in sorted(params) if params[key] not in (None, ""))
    return hashlib.sha1(f"{payload}{CLOUDINARY_API_SECRET}".encode("utf-8")).hexdigest()


def _cloudinary_upload_media(source: str, public_id: str, resource_type: Literal["image", "video", "auto"] = "auto") -> str:
    if not _cloudinary_ready():
        raise ValueError("Cloudinary env is not configured")
    upload_params: dict[str, Any] = {
        "folder": CLOUDINARY_FOLDER,
        "public_id": public_id,
        "timestamp": int(pytime.time()),
        "overwrite": "true",
    }
    body = {
        **upload_params,
        "file": source,
        "api_key": CLOUDINARY_API_KEY,
        "signature": _cloudinary_signature(upload_params),
    }
    req = urllib.request.Request(
        url=f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/{resource_type}/upload",
        data=urllib.parse.urlencode(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        payload = json.loads(response.read().decode("utf-8"))
    secure_url = payload.get("secure_url")
    if not secure_url:
        raise ValueError("Cloudinary upload failed: missing secure_url")
    return str(secure_url)


def _cloudinary_upload_image(source: str, public_id: str) -> str:
    return _cloudinary_upload_media(source, public_id, "image")


def _cloudinary_public_id(item_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", item_id).strip("-") or uuid.uuid4().hex[:10]


def _upload_media_preview_to_cloudinary(item_id: str, media_preview: str, media_type: Optional[str]) -> str:
    cleaned = media_preview.strip()
    if not cleaned:
        raise ValueError("media_preview is empty")
    if cleaned.startswith(("http://", "https://")) and _is_cloudinary_url(cleaned):
        return cleaned
    if cleaned.startswith("data:") and not cleaned.startswith(("data:image/", "data:video/")):
        raise ValueError("media_preview must be an image or video data URL")
    resource_type: Literal["image", "video", "auto"] = "video" if media_type == "Video" or cleaned.startswith("data:video/") else "image"
    return _cloudinary_upload_media(cleaned, _cloudinary_public_id(item_id), resource_type)


def _meta_graph_post(path: str, params: dict[str, Any]) -> dict[str, Any]:
    body = {k: str(v) for k, v in params.items() if v is not None}
    encoded = urllib.parse.urlencode(body).encode("utf-8")
    req = urllib.request.Request(
        url=f"https://graph.facebook.com/{META_GRAPH_API_VERSION}{path}",
        data=encoded,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload if isinstance(payload, dict) else {}


def _meta_graph_get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode({k: str(v) for k, v in params.items() if v is not None})
    req = urllib.request.Request(
        url=f"https://graph.facebook.com/{META_GRAPH_API_VERSION}{path}?{query}",
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload if isinstance(payload, dict) else {}


def _meta_error_text(payload: dict[str, Any]) -> str:
    error = payload.get("error")
    if isinstance(error, dict):
        message = str(error.get("message", "Unknown Meta API error"))
        code = error.get("code")
        subcode = error.get("error_subcode")
        suffix: list[str] = []
        if code is not None:
            suffix.append(f"code={code}")
        if subcode is not None:
            suffix.append(f"subcode={subcode}")
        return f"{message} ({', '.join(suffix)})" if suffix else message
    return "Unknown Meta API error"


def _meta_error_requires_reauth(payload: dict[str, Any]) -> bool:
    error = payload.get("error")
    if not isinstance(error, dict):
        return False
    code = error.get("code")
    subcode = error.get("error_subcode")
    try:
        code_i = int(code) if code is not None else None
    except Exception:
        code_i = None
    try:
        subcode_i = int(subcode) if subcode is not None else None
    except Exception:
        subcode_i = None
    # Meta token/session invalidation patterns.
    return code_i == 190 or subcode_i in (458, 459, 460, 463, 467)


def _coerce_public_media_url_for_meta(
    item_id: str,
    title: str,
    platform: Literal["facebook", "instagram"],
    media_preview: Optional[str],
    media_type: Optional[str],
) -> tuple[Optional[str], Optional[str], bool]:
    cleaned = (media_preview or "").strip()
    if cleaned.startswith(("http://", "https://")):
        return cleaned, None, False
    if cleaned.startswith("data:video/"):
        try:
            uploaded_url = _upload_media_preview_to_cloudinary(item_id, cleaned, "Video")
            return uploaded_url, f"{title}: {platform.capitalize()} publish uploaded video media_preview to Cloudinary", True
        except Exception as e:  # noqa: BLE001
            return None, f"{title}: {platform.capitalize()} publish failed: Cloudinary video upload failed ({e})", False
    if cleaned.startswith("data:image/") or not cleaned:
        if cleaned.startswith("data:image/"):
            try:
                uploaded_url = _upload_media_preview_to_cloudinary(item_id, cleaned, media_type)
                return uploaded_url, f"{title}: {platform.capitalize()} publish uploaded media_preview to Cloudinary", True
            except Exception as e:  # noqa: BLE001
                return None, f"{title}: {platform.capitalize()} publish failed: Cloudinary upload failed ({e})", False
        fallback_url = f"https://picsum.photos/seed/meta-{item_id}/1280/720"
        return (
            fallback_url,
            f"{title}: {platform.capitalize()} publish used placeholder public image URL because media_preview was not publicly accessible",
            False,
        )
    # Non-http schemes (blob:, file:, etc.) are invalid for Meta publishing APIs.
    if media_type == "Video":
        return None, f"{title}: {platform.capitalize()} publish failed: requires a public video URL", False
    fallback_url = f"https://picsum.photos/seed/meta-{item_id}/1280/720"
    return (
        fallback_url,
        f"{title}: {platform.capitalize()} publish used placeholder public image URL because media_preview was not publicly accessible",
        False,
    )


def _publish_to_facebook(
    content_text: str,
    title: str,
    media_preview: Optional[str],
    media_type: Optional[str],
    _allow_refresh_retry: bool = True,
) -> tuple[bool, str]:
    facebook_token = _meta_facebook_token()
    if not _meta_token_usable(facebook_token):
        return False, "Facebook publish failed: missing META_FACEBOOK_ACCESS_TOKEN (or fallback META_PAGE_ACCESS_TOKEN) in backend env"
    if not META_PAGE_ID:
        return False, "Facebook publish failed: missing META_PAGE_ID in backend env"

    message = f"{title}\n\n{content_text}".strip()
    path = f"/{META_PAGE_ID}/feed"
    params: dict[str, Any] = {
        "access_token": facebook_token,
        "message": message,
    }
    if media_preview and media_preview.startswith(("http://", "https://")):
        if media_type == "Video":
            path = f"/{META_PAGE_ID}/videos"
            params = {
                "access_token": facebook_token,
                "file_url": media_preview,
                "description": message,
            }
        else:
            path = f"/{META_PAGE_ID}/photos"
            params = {
                "access_token": facebook_token,
                "url": media_preview,
                "caption": message,
                "published": "true",
            }
    elif media_preview and media_preview.startswith("data:"):
        return False, "Facebook publish failed: data URLs are not supported, use a public media URL"

    try:
        payload = _meta_graph_post(path, params)
    except urllib.error.HTTPError as e:
        detail = ""
        detail_json: dict[str, Any] = {}
        try:
            detail_raw = e.read().decode("utf-8")
            parsed = json.loads(detail_raw) if detail_raw else {}
            detail_json = parsed if isinstance(parsed, dict) else {}
            detail = _meta_error_text(detail_json) if isinstance(detail_json, dict) else detail_raw
        except Exception:
            detail = str(e)
        if _meta_error_requires_reauth(detail_json) and _allow_refresh_retry:
            previous = facebook_token
            _refresh_runtime_env()
            if _meta_facebook_token() and _meta_facebook_token() != previous:
                return _publish_to_facebook(
                    content_text=content_text,
                    title=title,
                    media_preview=media_preview,
                    media_type=media_type,
                    _allow_refresh_retry=False,
                )
        return False, f"Facebook publish failed ({e.code}): {detail[:320]}"
    except Exception as e:  # noqa: BLE001
        return False, f"Facebook publish failed: {e}"

    if payload.get("id") or payload.get("post_id"):
        return True, "Facebook publish succeeded"
    return False, f"Facebook publish failed: {_meta_error_text(payload)}"


def _publish_to_instagram(
    content_text: str,
    title: str,
    media_preview: Optional[str],
    media_type: Optional[str],
    _allow_refresh_retry: bool = True,
) -> tuple[bool, str]:
    instagram_token = _meta_instagram_token()
    if not _meta_token_usable(instagram_token):
        return False, "Instagram publish failed: missing META_INSTAGRAM_ACCESS_TOKEN (or fallback META_PAGE_ACCESS_TOKEN) in backend env"
    if not META_IG_BUSINESS_ACCOUNT_ID:
        return False, "Instagram publish failed: missing META_IG_BUSINESS_ACCOUNT_ID in backend env"
    if not media_preview or not media_preview.startswith(("http://", "https://")):
        return False, "Instagram publish failed: requires a public image/video URL in media_preview"

    caption = f"{title}\n\n{content_text}".strip()
    media_params: dict[str, Any] = {
        "access_token": instagram_token,
        "caption": caption[:2200],
    }
    if media_type == "Video":
        media_params["video_url"] = media_preview
        media_params["media_type"] = "REELS"
    else:
        media_params["image_url"] = media_preview

    def _wait_container_ready(creation_id: str, attempts: int = 10, interval_seconds: float = 2.0) -> tuple[bool, str]:
        last = "IN_PROGRESS"
        for _ in range(attempts):
            status_payload = _meta_graph_get(
                f"/{creation_id}",
                {
                    "fields": "status_code,status",
                    "access_token": instagram_token,
                },
            )
            status_code = str(status_payload.get("status_code", "")).upper()
            status_value = str(status_payload.get("status", "")).upper()
            if status_code in ("FINISHED", "PUBLISHED"):
                return True, "ready"
            if status_code in ("ERROR", "EXPIRED"):
                return False, status_code
            if status_value in ("ERROR", "EXPIRED"):
                return False, status_value
            if status_code:
                last = status_code
            elif status_value:
                last = status_value
            pytime.sleep(interval_seconds)
        return False, f"timeout waiting for container readiness ({last})"

    try:
        create_payload = _meta_graph_post(f"/{META_IG_BUSINESS_ACCOUNT_ID}/media", media_params)
        creation_id = create_payload.get("id")
        if not creation_id:
            if _meta_error_requires_reauth(create_payload):
                return False, f"Instagram publish failed (container): {_meta_error_text(create_payload)}"
            return False, f"Instagram publish failed (container): {_meta_error_text(create_payload)}"
        ready, reason = _wait_container_ready(str(creation_id))
        if not ready:
            return False, f"Instagram publish failed: media container not ready ({reason})"
        publish_payload = _meta_graph_post(
            f"/{META_IG_BUSINESS_ACCOUNT_ID}/media_publish",
            {"access_token": instagram_token, "creation_id": creation_id},
        )
    except urllib.error.HTTPError as e:
        detail = ""
        detail_json: dict[str, Any] = {}
        try:
            detail_raw = e.read().decode("utf-8")
            parsed = json.loads(detail_raw) if detail_raw else {}
            detail_json = parsed if isinstance(parsed, dict) else {}
            detail = _meta_error_text(detail_json) if isinstance(detail_json, dict) else detail_raw
        except Exception:
            detail = str(e)
        if _meta_error_requires_reauth(detail_json) and _allow_refresh_retry:
            previous = instagram_token
            _refresh_runtime_env()
            if _meta_instagram_token() and _meta_instagram_token() != previous:
                return _publish_to_instagram(
                    content_text=content_text,
                    title=title,
                    media_preview=media_preview,
                    media_type=media_type,
                    _allow_refresh_retry=False,
                )
        return False, f"Instagram publish failed ({e.code}): {detail[:320]}"
    except Exception as e:  # noqa: BLE001
        return False, f"Instagram publish failed: {e}"

    if publish_payload.get("id"):
        return True, "Instagram publish succeeded"
    if _meta_error_requires_reauth(publish_payload):
        return False, f"Instagram publish failed (publish): {_meta_error_text(publish_payload)}"
    return False, f"Instagram publish failed (publish): {_meta_error_text(publish_payload)}"


def _linkedin_ugc_payload(
    content_text: str,
    title: str,
    media_preview: Optional[str],
    media_type: Optional[str],
    media_asset_urn: Optional[str] = None,
    media_asset_category: Optional[Literal["IMAGE", "VIDEO"]] = None,
) -> dict[str, Any]:
    share_content: dict[str, Any] = {
        "shareCommentary": {"text": content_text},
        "shareMediaCategory": "NONE",
    }
    if media_asset_urn:
        share_content = {
            "shareCommentary": {"text": content_text},
            "shareMediaCategory": media_asset_category or "IMAGE",
            "media": [
                {
                    "status": "READY",
                    "media": media_asset_urn,
                    "title": {"text": title or "FlowPilot Post"},
                }
            ],
        }
        return {
            "author": LINKEDIN_AUTHOR_URN,
            "lifecycleState": "PUBLISHED",
            "specificContent": {"com.linkedin.ugc.ShareContent": share_content},
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        }
    if media_preview and media_type in ("Image", "Video", "Carousel", "Media"):
        # LinkedIn can unfurl a public URL as an ARTICLE preview; this avoids upload complexity for MVP.
        share_content = {
            "shareCommentary": {"text": content_text},
            "shareMediaCategory": "ARTICLE",
            "media": [
                {
                    "status": "READY",
                    "originalUrl": media_preview,
                    "title": {"text": title or "FlowPilot Post"},
                }
            ],
        }
    return {
        "author": LINKEDIN_AUTHOR_URN,
        "lifecycleState": "PUBLISHED",
        "specificContent": {"com.linkedin.ugc.ShareContent": share_content},
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }


def _parse_data_url(data_url: str) -> tuple[str, bytes]:
    matched = re.match(r"^data:(?P<mime>[\w.+-]+/[\w.+-]+);base64,(?P<data>.+)$", data_url)
    if not matched:
        raise ValueError("Invalid data URL format")
    mime = matched.group("mime")
    payload = matched.group("data")
    try:
        blob = base64.b64decode(payload)
    except Exception as e:  # noqa: BLE001
        raise ValueError("Invalid base64 payload") from e
    return mime, blob


def _linkedin_register_image_upload() -> tuple[str, str]:
    return _linkedin_register_upload("urn:li:digitalmediaRecipe:feedshare-image")


def _linkedin_register_video_upload() -> tuple[str, str]:
    return _linkedin_register_upload("urn:li:digitalmediaRecipe:feedshare-video")


def _linkedin_register_upload(recipe: str) -> tuple[str, str]:
    body = {
        "registerUploadRequest": {
            "recipes": [recipe],
            "owner": LINKEDIN_AUTHOR_URN,
            "serviceRelationships": [
                {
                    "relationshipType": "OWNER",
                    "identifier": "urn:li:userGeneratedContent",
                }
            ],
        }
    }
    req = urllib.request.Request(
        url="https://api.linkedin.com/v2/assets?action=registerUpload",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": LINKEDIN_API_VERSION,
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    value = payload.get("value", {})
    asset = value.get("asset")
    upload_url = value.get("uploadMechanism", {}).get("com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest", {}).get("uploadUrl")
    if not asset or not upload_url:
        raise ValueError("LinkedIn register upload failed: missing asset or upload URL")
    return str(asset), str(upload_url)


def _linkedin_upload_image_binary(upload_url: str, blob: bytes, mime: str) -> None:
    req = urllib.request.Request(
        url=upload_url,
        data=blob,
        method="PUT",
        headers={
            "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
            "Content-Type": mime,
            "Content-Length": str(len(blob)),
        },
    )
    with urllib.request.urlopen(req, timeout=30):
        return


def _download_remote_media(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(
        url=url,
        method="GET",
        headers={
            "User-Agent": "FlowPilot/1.0",
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        blob = response.read()
        mime = response.headers.get("Content-Type", "").split(";")[0].strip()
    if not blob:
        raise ValueError("Remote media download returned empty body")
    return blob, (mime or "application/octet-stream")


def _linkedin_check_asset_ready(asset_urn: str) -> tuple[bool, str]:
    req = urllib.request.Request(
        url=f"https://api.linkedin.com/v2/assets/{urllib.parse.quote(asset_urn, safe='')}",
        method="GET",
        headers={
            "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": LINKEDIN_API_VERSION,
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    recipes = payload.get("recipes", [])
    status = payload.get("status", "")
    if isinstance(status, str) and status.upper() in ("ALLOWED", "AVAILABLE", "READY"):
        return True, "ready"
    if any(isinstance(r, str) and "feedshare-video" in r for r in recipes):
        # For video uploads LinkedIn needs processing; presence of recipe alone is not enough.
        # Try best effort check on processing status fields.
        processing = payload.get("mediaArtifact", {}).get("status") or payload.get("digitalmediaAsset", {}).get("status")
        if isinstance(processing, str) and processing.upper() in ("AVAILABLE", "READY"):
            return True, "ready"
        if isinstance(processing, str) and processing.upper() in ("FAILED", "CLIENT_ERROR", "SERVER_ERROR"):
            return False, f"processing failed ({processing})"
        return False, "processing"
    return True, "ready"


def _linkedin_wait_until_ready(asset_urn: str, max_attempts: int = 15, interval_seconds: float = 2.0) -> tuple[bool, str]:
    last_reason = "processing"
    for _ in range(max_attempts):
        ok, reason = _linkedin_check_asset_ready(asset_urn)
        if ok:
            return True, "ready"
        if "failed" in reason:
            return False, reason
        last_reason = reason
        pytime.sleep(interval_seconds)
    return False, f"timeout waiting for asset readiness ({last_reason})"


def _publish_to_linkedin(
    content_text: str,
    title: str,
    media_preview: Optional[str],
    media_type: Optional[str],
) -> tuple[bool, str]:
    if not LINKEDIN_ACCESS_TOKEN:
        return False, "LinkedIn publish failed: missing LINKEDIN_ACCESS_TOKEN in backend env"
    if not LINKEDIN_AUTHOR_URN:
        return False, "LinkedIn publish failed: missing LINKEDIN_AUTHOR_URN in backend env"
    if not LINKEDIN_AUTHOR_URN.startswith("urn:li:"):
        return False, "LinkedIn publish failed: LINKEDIN_AUTHOR_URN must start with urn:li:"

    media_asset_urn: Optional[str] = None
    media_asset_category: Optional[Literal["IMAGE", "VIDEO"]] = None
    if media_preview and media_preview.startswith("data:image/"):
        try:
            mime, blob = _parse_data_url(media_preview)
            asset, upload_url = _linkedin_register_image_upload()
            _linkedin_upload_image_binary(upload_url, blob, mime)
            media_asset_urn = asset
            media_asset_category = "IMAGE"
        except Exception as e:  # noqa: BLE001
            return False, f"LinkedIn image upload failed: {e}"
    elif media_preview and media_preview.startswith(("http://", "https://")) and media_type in ("Image", "Media", "Carousel"):
        try:
            blob, mime = _download_remote_media(media_preview)
            if mime.startswith("image/"):
                asset, upload_url = _linkedin_register_image_upload()
                _linkedin_upload_image_binary(upload_url, blob, mime)
                media_asset_urn = asset
                media_asset_category = "IMAGE"
            elif mime.startswith("video/"):
                asset, upload_url = _linkedin_register_video_upload()
                _linkedin_upload_image_binary(upload_url, blob, mime)
                ready, reason = _linkedin_wait_until_ready(asset)
                if not ready:
                    return False, f"LinkedIn video upload processing failed: {reason}"
                media_asset_urn = asset
                media_asset_category = "VIDEO"
        except Exception:
            # Keep ARTICLE fallback behavior for external URLs if fetch/upload fails.
            pass
    elif media_preview and media_preview.startswith("data:video/"):
        try:
            mime, blob = _parse_data_url(media_preview)
            asset, upload_url = _linkedin_register_video_upload()
            _linkedin_upload_image_binary(upload_url, blob, mime)
            ready, reason = _linkedin_wait_until_ready(asset)
            if not ready:
                return False, f"LinkedIn video upload processing failed: {reason}"
            media_asset_urn = asset
            media_asset_category = "VIDEO"
        except Exception as e:  # noqa: BLE001
            return False, f"LinkedIn video upload failed: {e}"

    def _request(body: dict[str, Any]) -> tuple[bool, str]:
        req = urllib.request.Request(
            url="https://api.linkedin.com/v2/ugcPosts",
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
                "LinkedIn-Version": LINKEDIN_API_VERSION,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                if response.status in (200, 201):
                    return True, "LinkedIn publish succeeded"
                return False, f"LinkedIn publish failed: unexpected status {response.status}"
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")
            except Exception:
                detail = str(e)
            return False, f"LinkedIn publish failed ({e.code}): {detail[:300]}"
        except Exception as e:  # noqa: BLE001
            return False, f"LinkedIn publish failed: {e}"

    primary = _linkedin_ugc_payload(
        content_text=content_text,
        title=title,
        media_preview=media_preview,
        media_type=media_type,
        media_asset_urn=media_asset_urn,
        media_asset_category=media_asset_category,
    )
    ok, message = _request(primary)
    if ok:
        return True, message

    # Fallback to text-only for resilience if LinkedIn rejects external media URL.
    fallback = _linkedin_ugc_payload(content_text=content_text, title=title, media_preview=None, media_type=None)
    ok_fallback, fallback_message = _request(fallback)
    if ok_fallback:
        return True, "LinkedIn published as text-only (media fallback applied)"
    return False, fallback_message if "LinkedIn publish failed" in fallback_message else message


class StrategyPlan(BaseModel):
    target_audience: str
    content_themes: list[str]
    platform_focus: list[str]
    market_gaps: list[str]


class Competitor(BaseModel):
    id: str
    name: str
    positioning: str
    strengths: list[str]
    weaknesses: list[str]


class ContentItem(BaseModel):
    id: str
    title: str
    content_text: str
    media_type: Literal["Image", "Video", "Carousel", "Media"]
    media_preview: str
    status: Literal["PENDING", "APPROVED", "SCHEDULED", "PUBLISHED", "REJECTED"]
    selected_platform: Optional[Literal["linkedin", "instagram", "facebook", "twitter"]] = None
    scheduled_at: Optional[str] = None


def _parse_json_object(raw_text: str) -> dict[str, Any] | None:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _openrouter_chat_json(system_prompt: str, user_prompt: str, max_tokens: int = 1400) -> dict[str, Any] | None:
    if not _openrouter_ready():
        return None

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": OPENROUTER_APP_NAME,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            body = json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    return _parse_json_object(str(content))


def _string_list(value: Any, fallback: list[str], limit: int) -> list[str]:
    if not isinstance(value, list):
        return fallback[:limit]
    cleaned = [str(item).strip() for item in value if str(item).strip()]
    return (cleaned or fallback)[:limit]


def _ai_strategy_plan(company_name: str, website: str) -> StrategyPlan | None:
    system_prompt = (
        "You are FlowPilot's marketing strategy assistant. Return only compact JSON for a social media strategy. "
        "Do not include markdown or commentary."
    )
    user_prompt = json.dumps(
        {
            "company_name": company_name or "Client Brand",
            "website": website,
            "required_schema": {
                "target_audience": "one specific sentence",
                "content_themes": ["4 short themes"],
                "platform_focus": ["3 platform-specific focus areas"],
                "market_gaps": ["3 concise market gaps"],
            },
        },
    )
    result = _openrouter_chat_json(system_prompt, user_prompt, max_tokens=900)
    if not result:
        return None

    fallback = StrategyPlan(
        target_audience="Marketing leaders at B2B companies with teams of 20-200 focused on pipeline predictability.",
        content_themes=[
            "Pipeline acceleration",
            "Campaign performance insights",
            "Cross-channel coordination",
            "Brand consistency at scale",
        ],
        platform_focus=["LinkedIn executive updates", "Meta proof points", "Lifecycle email touchpoints"],
        market_gaps=[
            "Most competitors post campaign announcements, but few publish post-mortem learning loops.",
            "Cross-platform narrative continuity is weak, leaving conversion intent under-captured.",
            "Educational mid-funnel assets are underused versus high-volume top-funnel posts.",
        ],
    )
    return StrategyPlan(
        target_audience=str(result.get("target_audience") or fallback.target_audience).strip()[:500],
        content_themes=_string_list(result.get("content_themes"), fallback.content_themes, 4),
        platform_focus=_string_list(result.get("platform_focus"), fallback.platform_focus, 3),
        market_gaps=_string_list(result.get("market_gaps"), fallback.market_gaps, 3),
    )


def _ai_content_calendar(total: int) -> list[dict[str, str]] | None:
    system_prompt = (
        "You are FlowPilot's social content planner. Return only JSON for a review-ready social calendar. "
        "Each item should be practical, brand-safe, and ready for LinkedIn, Facebook, or Instagram adaptation."
    )
    user_prompt = json.dumps(
        {
            "company_name": state.company_name,
            "website": state.company_website,
            "strategy": state.strategy.model_dump() if state.strategy else None,
            "item_count": total,
            "required_schema": {"items": [{"title": "short title", "content_text": "80-160 word post copy"}]},
        },
    )
    result = _openrouter_chat_json(system_prompt, user_prompt, max_tokens=min(3500, 600 + total * 180))
    if not result or not isinstance(result.get("items"), list):
        return None

    rows: list[dict[str, str]] = []
    for item in result["items"][:total]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        content_text = str(item.get("content_text") or "").strip()
        if title and content_text:
            rows.append({"title": title[:120], "content_text": content_text[:1200]})
    return rows if rows else None


class LeadItem(BaseModel):
    id: str
    name: str
    email: str
    source: str
    status: Literal["New", "Contacted", "Qualified"]
    crm_status: Literal["Pending", "Synced"]
    captured_at: str


class ActivityItem(BaseModel):
    id: str
    text: str
    created_at: str


class PublishingLogItem(BaseModel):
    id: str
    content_id: str
    platform: str
    timestamp: str
    status: Literal["Success", "Failed"]


class MediaLibraryItem(BaseModel):
    id: str
    name: str
    media_type: Literal["Image", "Video", "Carousel", "Media"]
    media_url: str
    created_at: str


class IntegrationState(BaseModel):
    connected: bool = False
    account_name: Optional[str] = None
    account_handle: Optional[str] = None


class ProfileState(BaseModel):
    name: str = ""
    email: str = ""
    company: str = ""
    timezone: str = "America/New_York"


class PreferencesState(BaseModel):
    default_platform: Literal["linkedin", "instagram", "facebook", "twitter"] = "linkedin"
    quiet_hours_enabled: bool = True
    approval_digest: Literal["instant", "daily"] = "daily"


class CampaignState(BaseModel):
    id: str
    name: str
    budget: int
    status: Literal["Draft", "Active", "Paused"]


class SetupRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    website: str = Field(default="", max_length=500)
    scenario: Literal["b2b-saas", "ecommerce", "agency"]
    workspace_owner_name: str = Field(default="", max_length=120)
    workspace_owner_email: str = Field(default="", max_length=200)


class AuthPayload(BaseModel):
    email: str
    password: str


class SignupPayload(AuthPayload):
    name: str


SCENARIO_PRESETS: dict[str, dict[str, Any]] = {
    "b2b-saas": {
        "label": "B2B SaaS",
        "target": "CMOs and demand generation leads at B2B SaaS companies with 20-200 employees.",
        "themes": ["Pipeline acceleration", "Product-led proof", "Funnel conversion", "Retention playbooks"],
        "focus": ["LinkedIn leadership posts", "Facebook retargeting updates", "Webinar nurture"],
        "campaigns": [
            ("Q3 Demo Pipeline Push", 24000, "Active"),
            ("Mid-Market Webinar Series", 16500, "Active"),
            ("Customer Expansion Playbook", 9800, "Draft"),
            ("Retention Rescue Sequence", 7000, "Paused"),
        ],
        "activities": [
            "Content approved for founder thought leadership",
            "Webinar post published to LinkedIn",
            "Lead captured from product tour CTA",
        ],
        "engagement": [3800, 4200, 4700, 5200, 5600, 3200, 3300],
        "reach": [16200, 17100, 19400, 20500, 21800, 11600, 12200],
        "leads_growth": [11, 15, 14, 19, 24, 29],
    },
    "ecommerce": {
        "label": "Ecommerce",
        "target": "DTC growth managers and ecommerce directors focused on repeat purchase and AOV lift.",
        "themes": ["Product drops", "UGC proof", "Seasonal offers", "Loyalty loop content"],
        "focus": ["Instagram product storytelling", "Facebook conversion creatives", "LinkedIn brand ops updates"],
        "campaigns": [
            ("Summer Product Drop", 32000, "Active"),
            ("Creator UGC Sprint", 19000, "Active"),
            ("Abandoned Cart Recovery", 12000, "Active"),
            ("VIP Loyalty Refresh", 8300, "Draft"),
        ],
        "activities": [
            "Carousel approved for spring collection",
            "Instagram post published for launch day",
            "Lead captured from giveaway landing page",
        ],
        "engagement": [6100, 7400, 6900, 7800, 8400, 5200, 5500],
        "reach": [25500, 29200, 27300, 30800, 32900, 20800, 21900],
        "leads_growth": [18, 22, 24, 30, 35, 41],
    },
    "agency": {
        "label": "Marketing Agency",
        "target": "Founders and heads of marketing looking for outsourced campaign execution and reporting.",
        "themes": ["Case studies", "Process transparency", "Channel strategy", "Client results"],
        "focus": ["LinkedIn case studies", "Facebook portfolio clips", "Instagram creative showcases"],
        "campaigns": [
            ("Client Case Study Series", 14000, "Active"),
            ("Outbound Prospect Nurture", 9000, "Active"),
            ("Regional Event Promo", 7600, "Draft"),
            ("Referral Engine Relaunch", 5000, "Paused"),
        ],
        "activities": [
            "Case-study content approved",
            "Facebook client testimonial published",
            "Lead captured from service inquiry form",
        ],
        "engagement": [3100, 3600, 3400, 4100, 4600, 2900, 3050],
        "reach": [12900, 14100, 13800, 15700, 16900, 11200, 11600],
        "leads_growth": [8, 11, 10, 13, 17, 19],
    },
}


class SupabaseStateStore:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self.enabled = bool(database_url and psycopg2 is not None)
        self.last_error: str = ""
        self.table_name = "flowpilot_state"
        self.state_key = "global"

    def _connect(self):
        if not self.enabled:
            return None
        return psycopg2.connect(self.database_url)  # type: ignore[union-attr]

    def ensure_schema(self) -> bool:
        if not self.enabled:
            self.last_error = "DATABASE_URL missing or psycopg2 unavailable"
            return False
        try:
            with self._connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        create table if not exists {self.table_name} (
                            key text primary key,
                            payload jsonb not null,
                            updated_at timestamptz not null default now()
                        );
                        """
                    )
                    cur.execute(
                        """
                        create table if not exists flowpilot_users (
                            id text primary key,
                            name text not null,
                            email text not null unique,
                            password text not null,
                            created_at timestamptz not null default now()
                        );

                        create table if not exists flowpilot_workspace (
                            workspace_id text primary key,
                            company_name text not null default '',
                            company_website text not null default '',
                            workspace_scenario text not null default 'b2b-saas',
                            workspace_configured boolean not null default false,
                            crm_last_bulk_status text not null default 'Pending',
                            updated_at timestamptz not null default now()
                        );

                        create table if not exists flowpilot_strategy (
                            workspace_id text primary key references flowpilot_workspace(workspace_id) on delete cascade,
                            target_audience text not null default '',
                            content_themes jsonb not null default '[]'::jsonb,
                            platform_focus jsonb not null default '[]'::jsonb,
                            market_gaps jsonb not null default '[]'::jsonb,
                            updated_at timestamptz not null default now()
                        );

                        create table if not exists flowpilot_competitors (
                            id text primary key,
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            name text not null,
                            positioning text not null,
                            strengths jsonb not null default '[]'::jsonb,
                            weaknesses jsonb not null default '[]'::jsonb
                        );

                        create table if not exists flowpilot_content (
                            id text primary key,
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            title text not null,
                            content_text text not null,
                            media_type text not null,
                            media_preview text not null,
                            status text not null,
                            selected_platform text,
                            scheduled_at text
                        );

                        create table if not exists flowpilot_leads (
                            id text primary key,
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            name text not null,
                            email text not null,
                            source text not null,
                            status text not null,
                            crm_status text not null,
                            captured_at text not null
                        );

                        create table if not exists flowpilot_activities (
                            id text primary key,
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            text text not null,
                            created_at text not null
                        );

                        create table if not exists flowpilot_publishing_log (
                            id text primary key,
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            content_id text not null,
                            platform text not null,
                            timestamp text not null,
                            status text not null
                        );

                        create table if not exists flowpilot_integrations (
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            platform text not null,
                            connected boolean not null default false,
                            account_name text,
                            account_handle text,
                            primary key (workspace_id, platform)
                        );

                        create table if not exists flowpilot_profile (
                            workspace_id text primary key references flowpilot_workspace(workspace_id) on delete cascade,
                            name text not null default '',
                            email text not null default '',
                            company text not null default '',
                            timezone text not null default 'America/New_York',
                            updated_at timestamptz not null default now()
                        );

                        create table if not exists flowpilot_preferences (
                            workspace_id text primary key references flowpilot_workspace(workspace_id) on delete cascade,
                            default_platform text not null default 'linkedin',
                            quiet_hours_enabled boolean not null default true,
                            approval_digest text not null default 'daily',
                            updated_at timestamptz not null default now()
                        );

                        create table if not exists flowpilot_campaigns (
                            id text primary key,
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            name text not null,
                            budget integer not null,
                            status text not null
                        );

                        create table if not exists flowpilot_engagement_series (
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            position integer not null,
                            name text not null,
                            engagement integer not null default 0,
                            reach integer not null default 0,
                            primary key (workspace_id, position)
                        );

                        create table if not exists flowpilot_leads_growth (
                            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
                            position integer not null,
                            name text not null,
                            leads integer not null default 0,
                            primary key (workspace_id, position)
                        );
                        """
                    )
                    conn.commit()
            return True
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            return False

    def _sync_relational_tables(self, cur, payload: dict[str, Any]) -> None:
        workspace_id = str(payload.get("workspace_id") or f"ws-{uuid.uuid4().hex[:10]}")
        users = payload.get("users", [])
        competitors = payload.get("competitors", [])
        content_rows = payload.get("content", [])
        leads = payload.get("leads", [])
        activities = payload.get("activities", [])
        publishing_log = payload.get("publishing_log", [])
        campaigns = payload.get("campaigns", [])
        engagement_series = payload.get("engagement_series", [])
        leads_growth = payload.get("leads_growth", [])
        integrations = payload.get("integrations", {})
        strategy = payload.get("strategy")
        profile = payload.get("profile")
        preferences = payload.get("preferences")

        cur.execute("delete from flowpilot_users")
        for user in users:
            if not isinstance(user, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_users (id, name, email, password, created_at)
                values (%s, %s, %s, %s, now())
                on conflict (id) do update set
                    name = excluded.name,
                    email = excluded.email,
                    password = excluded.password
                """,
                (
                    str(user.get("id", f"usr-{uuid.uuid4().hex[:10]}")),
                    str(user.get("name", "")),
                    str(user.get("email", "")).lower(),
                    str(user.get("password", "")),
                ),
            )

        cur.execute("delete from flowpilot_workspace")
        cur.execute(
            """
            insert into flowpilot_workspace (
                workspace_id, company_name, company_website, workspace_scenario, workspace_configured, crm_last_bulk_status, updated_at
            ) values (%s, %s, %s, %s, %s, %s, now())
            """,
            (
                workspace_id,
                str(payload.get("company_name", "")),
                str(payload.get("company_website", "")),
                str(payload.get("workspace_scenario", "b2b-saas")),
                bool(payload.get("workspace_configured", False)),
                "Synced" if payload.get("crm_last_bulk_status") == "Synced" else "Pending",
            ),
        )

        cur.execute("delete from flowpilot_strategy")
        if isinstance(strategy, dict):
            cur.execute(
                """
                insert into flowpilot_strategy (workspace_id, target_audience, content_themes, platform_focus, market_gaps, updated_at)
                values (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, now())
                """,
                (
                    workspace_id,
                    str(strategy.get("target_audience", "")),
                    json.dumps(strategy.get("content_themes", [])),
                    json.dumps(strategy.get("platform_focus", [])),
                    json.dumps(strategy.get("market_gaps", [])),
                ),
            )

        for table in (
            "flowpilot_competitors",
            "flowpilot_content",
            "flowpilot_leads",
            "flowpilot_activities",
            "flowpilot_publishing_log",
            "flowpilot_integrations",
            "flowpilot_profile",
            "flowpilot_preferences",
            "flowpilot_campaigns",
            "flowpilot_engagement_series",
            "flowpilot_leads_growth",
        ):
            cur.execute(f"delete from {table}")

        for row in competitors:
            if not isinstance(row, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_competitors (id, workspace_id, name, positioning, strengths, weaknesses)
                values (%s, %s, %s, %s, %s::jsonb, %s::jsonb)
                """,
                (
                    str(row.get("id", f"comp-{uuid.uuid4().hex[:8]}")),
                    workspace_id,
                    str(row.get("name", "")),
                    str(row.get("positioning", "")),
                    json.dumps(row.get("strengths", [])),
                    json.dumps(row.get("weaknesses", [])),
                ),
            )

        for row in content_rows:
            if not isinstance(row, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_content (
                    id, workspace_id, title, content_text, media_type, media_preview, status, selected_platform, scheduled_at
                ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(row.get("id", f"content-{uuid.uuid4().hex[:10]}")),
                    workspace_id,
                    str(row.get("title", "")),
                    str(row.get("content_text", "")),
                    str(row.get("media_type", "Image")),
                    str(row.get("media_preview", "")),
                    str(row.get("status", "PENDING")),
                    row.get("selected_platform"),
                    row.get("scheduled_at"),
                ),
            )

        for row in leads:
            if not isinstance(row, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_leads (id, workspace_id, name, email, source, status, crm_status, captured_at)
                values (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(row.get("id", f"lead-{uuid.uuid4().hex[:8]}")),
                    workspace_id,
                    str(row.get("name", "")),
                    str(row.get("email", "")),
                    str(row.get("source", "")),
                    str(row.get("status", "New")),
                    str(row.get("crm_status", "Pending")),
                    str(row.get("captured_at", _iso(_now()))),
                ),
            )

        for row in activities:
            if not isinstance(row, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_activities (id, workspace_id, text, created_at)
                values (%s, %s, %s, %s)
                """,
                (
                    str(row.get("id", f"act-{uuid.uuid4().hex[:8]}")),
                    workspace_id,
                    str(row.get("text", "")),
                    str(row.get("created_at", _iso(_now()))),
                ),
            )

        for row in publishing_log:
            if not isinstance(row, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_publishing_log (id, workspace_id, content_id, platform, timestamp, status)
                values (%s, %s, %s, %s, %s, %s)
                """,
                (
                    str(row.get("id", f"log-{uuid.uuid4().hex[:8]}")),
                    workspace_id,
                    str(row.get("content_id", "")),
                    str(row.get("platform", "")),
                    str(row.get("timestamp", _iso(_now()))),
                    str(row.get("status", "Success")),
                ),
            )

        if isinstance(integrations, dict):
            for platform in ("linkedin", "meta"):
                data = integrations.get(platform, {})
                if not isinstance(data, dict):
                    data = {}
                cur.execute(
                    """
                    insert into flowpilot_integrations (workspace_id, platform, connected, account_name, account_handle)
                    values (%s, %s, %s, %s, %s)
                    """,
                    (
                        workspace_id,
                        platform,
                        bool(data.get("connected", False)),
                        data.get("account_name"),
                        data.get("account_handle"),
                    ),
                )

        if isinstance(profile, dict):
            cur.execute(
                """
                insert into flowpilot_profile (workspace_id, name, email, company, timezone, updated_at)
                values (%s, %s, %s, %s, %s, now())
                """,
                (
                    workspace_id,
                    str(profile.get("name", "")),
                    str(profile.get("email", "")),
                    str(profile.get("company", "")),
                    str(profile.get("timezone", "America/New_York")),
                ),
            )

        if isinstance(preferences, dict):
            cur.execute(
                """
                insert into flowpilot_preferences (workspace_id, default_platform, quiet_hours_enabled, approval_digest, updated_at)
                values (%s, %s, %s, %s, now())
                """,
                (
                    workspace_id,
                    str(preferences.get("default_platform", "linkedin")),
                    bool(preferences.get("quiet_hours_enabled", True)),
                    str(preferences.get("approval_digest", "daily")),
                ),
            )

        for row in campaigns:
            if not isinstance(row, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_campaigns (id, workspace_id, name, budget, status)
                values (%s, %s, %s, %s, %s)
                """,
                (
                    str(row.get("id", f"cmp-{uuid.uuid4().hex[:8]}")),
                    workspace_id,
                    str(row.get("name", "")),
                    int(row.get("budget", 0)),
                    str(row.get("status", "Draft")),
                ),
            )

        for idx, row in enumerate(engagement_series):
            if not isinstance(row, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_engagement_series (workspace_id, position, name, engagement, reach)
                values (%s, %s, %s, %s, %s)
                """,
                (
                    workspace_id,
                    idx,
                    str(row.get("name", "")),
                    int(row.get("engagement", 0)),
                    int(row.get("reach", 0)),
                ),
            )

        for idx, row in enumerate(leads_growth):
            if not isinstance(row, dict):
                continue
            cur.execute(
                """
                insert into flowpilot_leads_growth (workspace_id, position, name, leads)
                values (%s, %s, %s, %s)
                """,
                (
                    workspace_id,
                    idx,
                    str(row.get("name", "")),
                    int(row.get("leads", 0)),
                ),
            )

    def load(self) -> Optional[dict[str, Any]]:
        if not self.enabled:
            return None
        if not self.ensure_schema():
            return None
        try:
            with self._connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"select payload from {self.table_name} where key = %s",
                        (self.state_key,),
                    )
                    row = cur.fetchone()
                    if not row:
                        return None
                    payload = row[0]
                    if isinstance(payload, dict):
                        return payload
                    if isinstance(payload, str):
                        return json.loads(payload)
                    return None
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            return None

    def save(self, payload: dict[str, Any]) -> bool:
        if not self.enabled:
            return False
        if not self.ensure_schema():
            return False
        try:
            with self._connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        insert into {self.table_name}(key, payload, updated_at)
                        values (%s, %s::jsonb, now())
                        on conflict (key) do update
                        set payload = excluded.payload,
                            updated_at = now()
                        """,
                        (self.state_key, json.dumps(payload)),
                    )
                    self._sync_relational_tables(cur, payload)
                    conn.commit()
            return True
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            return False


class AppState:
    def __init__(self) -> None:
        self.users: list[dict[str, str]] = []
        self.tokens: dict[str, str] = {}
        self.workspace_id: str = ""
        self.company_name: str = ""
        self.company_website: str = ""
        self.workspace_scenario: Literal["b2b-saas", "ecommerce", "agency"] = "b2b-saas"
        self.workspace_configured: bool = False
        self.strategy: Optional[StrategyPlan] = None
        self.competitors: list[Competitor] = []
        self.content: list[ContentItem] = []
        self.leads: list[LeadItem] = []
        self.activities: list[ActivityItem] = []
        self.publishing_log: list[PublishingLogItem] = []
        self.media_library: list[MediaLibraryItem] = []
        self.campaigns: list[CampaignState] = []
        self.engagement_series: list[dict[str, Any]] = []
        self.leads_growth: list[dict[str, Any]] = []
        self.linkedin = IntegrationState()
        self.meta = IntegrationState()
        self.profile = ProfileState()
        self.preferences = PreferencesState()
        self.crm_last_bulk_status: Literal["Synced", "Pending"] = "Pending"
        self.media_registry: set[str] = set()

    def _make_content(self, total: int) -> list[ContentItem]:
        statuses_cycle: list[Literal["PENDING", "APPROVED", "SCHEDULED", "PUBLISHED", "REJECTED"]] = [
            "PENDING",
            "PENDING",
            "PENDING",
            "APPROVED",
            "PENDING",
        ]
        rows: list[ContentItem] = []
        for index in range(total):
            st = statuses_cycle[index % len(statuses_cycle)]
            platform = random.choice(["linkedin", "instagram", "facebook", "twitter"])
            scheduled = None
            media_url = f"https://picsum.photos/seed/mcc-{uuid.uuid4().hex[:8]}/640/360"
            if st == "APPROVED":
                scheduled = _iso(_now() + timedelta(days=index % 5 + 1))
            rows.append(
                ContentItem(
                    id=f"content-{uuid.uuid4().hex[:8]}",
                    title=f"Campaign Asset {index + 1}",
                    content_text=CONTENT_SNIPPETS[index % len(CONTENT_SNIPPETS)],
                    media_type=random.choice(["Image", "Carousel", "Media"]),
                    media_preview=media_url,
                    status=st,
                    selected_platform=platform if st == "APPROVED" else None,
                    scheduled_at=scheduled if st == "APPROVED" else None,
                ),
            )
            self.media_registry.add(media_url)
        return rows

    def apply_setup(
        self,
        company_name: str,
        website: str,
        scenario: Literal["b2b-saas", "ecommerce", "agency"],
        owner_name: str,
        owner_email: str,
        mark_configured: bool = True,
    ) -> None:
        preset = SCENARIO_PRESETS[scenario]
        self.workspace_id = f"ws-{uuid.uuid4().hex[:10]}"
        self.company_name = company_name
        self.company_website = website
        self.workspace_scenario = scenario
        self.workspace_configured = mark_configured
        self.profile = ProfileState(
            name=owner_name.strip() or "Jordan Reeves",
            email=owner_email.strip() or "jordan.reeves@northline.co",
            company=company_name,
            timezone=self.profile.timezone,
        )
        self.strategy = StrategyPlan(
            target_audience=preset["target"],
            content_themes=list(preset["themes"]),
            platform_focus=list(preset["focus"]),
            market_gaps=[
                "Low-frequency founder narrative content despite high engagement potential.",
                "Limited platform-native case-study formats with measurable proof points.",
                "Inconsistent community follow-up sequences after campaign launches.",
            ],
        )
        total_competitors = random.randint(5, 10)
        names = random.sample(COMPETITOR_NAMES, k=total_competitors)
        self.competitors = [
            Competitor(
                id=f"comp-{uuid.uuid4().hex[:8]}",
                name=name,
                positioning=random.choice(
                    [
                        "Premium performance marketing for growth teams",
                        "SMB-friendly campaign execution with rapid testing",
                        "Enterprise reporting and multi-channel automation",
                    ],
                ),
                strengths=random.sample(
                    ["Strong paid social execution", "Consistent brand storytelling", "Fast campaign QA", "Solid analytics"],
                    k=3,
                ),
                weaknesses=random.sample(
                    ["Limited SEO depth", "Higher retainers", "Regional focus", "Narrow partner network"],
                    k=2,
                ),
            )
            for name in names
        ]
        self.content = self._make_content(total=random.randint(10, 20))
        self.leads = [
            LeadItem(
                id="lead-1",
                name="Alicia Gardner",
                email="alicia.gardner@oaklane.com",
                source=preset["campaigns"][0][0],
                status="Qualified",
                crm_status="Pending",
                captured_at=_iso(_now() - timedelta(days=2)),
            ),
            LeadItem(
                id="lead-2",
                name="Ravi Menon",
                email="ravi.menon@northpine.io",
                source=preset["campaigns"][1][0],
                status="New",
                crm_status="Pending",
                captured_at=_iso(_now() - timedelta(days=5)),
            ),
        ]
        self.activities = [
            ActivityItem(
                id="act-1",
                text=preset["activities"][0],
                created_at=_iso(_now() - timedelta(hours=6)),
            ),
            ActivityItem(
                id="act-2",
                text=preset["activities"][1],
                created_at=_iso(_now() - timedelta(hours=18)),
            ),
            ActivityItem(
                id="act-3",
                text=preset["activities"][2],
                created_at=_iso(_now() - timedelta(days=1)),
            ),
        ]
        self.publishing_log = []
        self.crm_last_bulk_status = "Pending"
        self.campaigns = [
            CampaignState(
                id=f"cmp-{i+1}",
                name=name,
                budget=budget,
                status=status,
            )
            for i, (name, budget, status) in enumerate(preset["campaigns"])
        ]
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        self.engagement_series = [
            {"name": days[i], "engagement": preset["engagement"][i], "reach": preset["reach"][i]}
            for i in range(7)
        ]
        self.leads_growth = [{"name": f"W{i + 1}", "leads": preset["leads_growth"][i]} for i in range(6)]

    def workspace(self) -> dict[str, Any]:
        return {
            "workspace_id": self.workspace_id,
            "company_name": self.company_name,
            "company_website": self.company_website,
            "workspace_scenario": self.workspace_scenario,
            "workspace_configured": self.workspace_configured,
            "strategy": self.strategy.model_dump() if self.strategy else None,
            "competitors": [c.model_dump() for c in self.competitors],
            "content": [c.model_dump() for c in self.content],
            "leads": [l.model_dump() for l in self.leads],
            "activities": [a.model_dump() for a in self.activities],
            "publishing_log": [p.model_dump() for p in self.publishing_log],
            "media_library": [m.model_dump() for m in self.media_library],
            "integrations": {
                "linkedin": self.linkedin.model_dump(),
                "meta": self.meta.model_dump(),
            },
            "profile": self.profile.model_dump(),
            "preferences": self.preferences.model_dump(),
            "crm_last_bulk_status": self.crm_last_bulk_status,
            "campaigns": [c.model_dump() for c in self.campaigns],
            "engagement_series": self.engagement_series,
            "leads_growth": self.leads_growth,
        }

    def snapshot(self) -> dict[str, Any]:
        payload = self.workspace()
        payload["users"] = self.users
        payload["tokens"] = self.tokens
        return payload

    def load_snapshot(self, payload: dict[str, Any]) -> None:
        users = payload.get("users")
        if isinstance(users, list):
            self.users = [
                {
                    "id": str(user.get("id", "")),
                    "name": str(user.get("name", "")),
                    "email": str(user.get("email", "")).lower(),
                    "password": str(user.get("password", "")),
                }
                for user in users
                if isinstance(user, dict) and user.get("email")
            ]

        tokens = payload.get("tokens")
        if isinstance(tokens, dict):
            self.tokens = {str(token): str(email).lower() for token, email in tokens.items() if token and email}

        self.workspace_id = str(payload.get("workspace_id", self.workspace_id))
        self.company_name = str(payload.get("company_name", self.company_name))
        self.company_website = str(payload.get("company_website", self.company_website))
        scenario = payload.get("workspace_scenario", self.workspace_scenario)
        if scenario in ("b2b-saas", "ecommerce", "agency"):
            self.workspace_scenario = scenario
        self.workspace_configured = bool(payload.get("workspace_configured", self.workspace_configured))

        strategy_payload = payload.get("strategy")
        self.strategy = StrategyPlan(**strategy_payload) if isinstance(strategy_payload, dict) else None
        self.competitors = [Competitor(**row) for row in payload.get("competitors", []) if isinstance(row, dict)]
        self.content = [ContentItem(**row) for row in payload.get("content", []) if isinstance(row, dict)]
        self.leads = [LeadItem(**row) for row in payload.get("leads", []) if isinstance(row, dict)]
        self.activities = [ActivityItem(**row) for row in payload.get("activities", []) if isinstance(row, dict)]
        self.publishing_log = [PublishingLogItem(**row) for row in payload.get("publishing_log", []) if isinstance(row, dict)]
        self.media_library = [MediaLibraryItem(**row) for row in payload.get("media_library", []) if isinstance(row, dict)]

        integrations = payload.get("integrations", {})
        if isinstance(integrations, dict):
            linkedin_data = integrations.get("linkedin")
            meta_data = integrations.get("meta")
            self.linkedin = IntegrationState(**linkedin_data) if isinstance(linkedin_data, dict) else IntegrationState()
            self.meta = IntegrationState(**meta_data) if isinstance(meta_data, dict) else IntegrationState()

        profile_payload = payload.get("profile")
        if isinstance(profile_payload, dict):
            self.profile = ProfileState(**profile_payload)
        preferences_payload = payload.get("preferences")
        if isinstance(preferences_payload, dict):
            self.preferences = PreferencesState(**preferences_payload)

        crm_status = payload.get("crm_last_bulk_status")
        self.crm_last_bulk_status = "Synced" if crm_status == "Synced" else "Pending"
        self.campaigns = [CampaignState(**row) for row in payload.get("campaigns", []) if isinstance(row, dict)]
        self.engagement_series = [row for row in payload.get("engagement_series", []) if isinstance(row, dict)]
        self.leads_growth = [row for row in payload.get("leads_growth", []) if isinstance(row, dict)]


state = AppState()
db_state_store = SupabaseStateStore(DATABASE_URL)
loaded_snapshot = db_state_store.load()
if loaded_snapshot:
    try:
        users = loaded_snapshot.get("users", []) if isinstance(loaded_snapshot, dict) else []
        has_seed_user = any(
            isinstance(u, dict)
            and (
                str(u.get("id", "")) == "usr-seed"
                or str(u.get("email", "")).lower() == DEFAULT_DEMO_EMAIL
            )
            for u in users
        )
        if has_seed_user:
            db_state_store.save(state.snapshot())
        else:
            state.load_snapshot(loaded_snapshot)
    except Exception as exc:  # noqa: BLE001
        db_state_store.last_error = f"snapshot restore failed: {exc}"
else:
    db_state_store.save(state.snapshot())

_persist_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="flowpilot-persist")
_persist_lock = Lock()
_persist_future: Future[None] | None = None
_pending_snapshot: dict[str, Any] | None = None


def _save_snapshot_chain(snapshot: dict[str, Any]) -> None:
    global _persist_future, _pending_snapshot
    current = snapshot
    while True:
        db_state_store.save(current)
        with _persist_lock:
            if _pending_snapshot is None:
                _persist_future = None
                return
            current = _pending_snapshot
            _pending_snapshot = None


def _persist_state(*, sync: bool = False) -> None:
    global _persist_future, _pending_snapshot
    snapshot = state.snapshot()
    if sync:
        db_state_store.save(snapshot)
        return
    with _persist_lock:
        if _persist_future and not _persist_future.done():
            _pending_snapshot = snapshot
            return
        _persist_future = _persist_executor.submit(_save_snapshot_chain, snapshot)


app = FastAPI(title="FlowPilot API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _auth_user(authorization: str | None) -> dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.replace("Bearer ", "", 1).strip()
    email = state.tokens.get(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = next((u for u in state.users if u["email"] == email), None)
    if not user:
        raise HTTPException(status_code=401, detail="Unknown user")
    return user


def _remember_cloudinary_media(name: str, media_url: str, media_type: Optional[str]) -> None:
    if not media_url or not _is_cloudinary_url(media_url):
        return
    existing = next((asset for asset in state.media_library if asset.media_url == media_url), None)
    if existing:
        existing.name = name or existing.name
        return
    normalized_type: Literal["Image", "Video", "Carousel", "Media"] = "Video" if media_type == "Video" else "Image"
    state.media_library.insert(
        0,
        MediaLibraryItem(
            id=f"asset-{uuid.uuid4().hex[:10]}",
            name=name or "Cloudinary media",
            media_type=normalized_type,
            media_url=media_url,
            created_at=_iso(_now()),
        ),
    )
    state.media_library = state.media_library[:100]


@app.post("/signup")
def post_signup(body: SignupPayload) -> dict[str, Any]:
    email = body.email.strip().lower()
    if any(u["email"] == email for u in state.users):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": f"usr-{uuid.uuid4().hex[:10]}",
        "name": body.name.strip() or "User",
        "email": email,
        "password": body.password,
    }
    state.users.append(user)
    _persist_state()
    token = f"fp.{uuid.uuid4().hex}.{uuid.uuid4().hex[:10]}"
    state.tokens[token] = user["email"]
    return {"token": token, "user": {"name": user["name"], "email": user["email"]}}


@app.post("/login")
def post_login(body: AuthPayload) -> dict[str, Any]:
    email = body.email.strip().lower()
    user = next((u for u in state.users if u["email"] == email and u["password"] == body.password), None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = f"fp.{uuid.uuid4().hex}.{uuid.uuid4().hex[:10]}"
    state.tokens[token] = user["email"]
    return {"token": token, "user": {"name": user["name"], "email": user["email"]}}


@app.get("/workspace")
def get_workspace(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    return state.workspace()


@app.get("/health/db")
def get_db_health() -> dict[str, Any]:
    return {
        "database_enabled": db_state_store.enabled,
        "database_ready": db_state_store.ensure_schema() if db_state_store.enabled else False,
        "last_error": db_state_store.last_error,
    }


@app.post("/workspace")
def post_workspace(body: SetupRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    state.apply_setup(
        company_name=body.company_name.strip(),
        website=body.website.strip(),
        scenario=body.scenario,
        owner_name=body.workspace_owner_name.strip(),
        owner_email=body.workspace_owner_email.strip(),
        mark_configured=True,
    )
    state.activities.insert(
        0,
        ActivityItem(
            id=f"act-{uuid.uuid4().hex[:8]}",
            text=f"Workspace configured for {SCENARIO_PRESETS[body.scenario]['label']}",
            created_at=_iso(_now()),
        ),
    )
    _persist_state()
    return state.workspace()


@app.post("/workspace/setup")
def post_workspace_setup(body: SetupRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    return post_workspace(body, authorization)


class StrategyRequest(BaseModel):
    company_name: str = Field(default="", max_length=200)
    website: str = Field(default="", max_length=500)


@app.post("/strategy")
def post_strategy(body: StrategyRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    _refresh_runtime_env()
    state.company_name = body.company_name.strip() or "Client Brand"
    state.company_website = body.website.strip()
    total = random.randint(5, 10)
    competitors: list[Competitor] = []
    used = random.sample(COMPETITOR_NAMES, k=min(total, len(COMPETITOR_NAMES)))
    for index, name in enumerate(used):
        competitors.append(
            Competitor(
                id=f"comp-{uuid.uuid4().hex[:8]}",
                name=name,
                positioning=random.choice(
                    [
                        "Premium performance marketing for B2B teams",
                        "SMB-friendly creative with fast turnaround",
                        "Enterprise-grade automation and reporting",
                    ]
                ),
                strengths=random.sample(
                    ["Strong paid social execution", "Consistent brand storytelling", "Fast campaign QA", "Solid analytics"],
                    k=3,
                ),
                weaknesses=random.sample(
                    ["Limited SEO depth", "Higher retainers", "Regional focus", "Narrow partner network"],
                    k=2,
                ),
            )
        )
    state.competitors = competitors
    state.strategy = _ai_strategy_plan(state.company_name, state.company_website) or StrategyPlan(
        target_audience="Marketing leaders at B2B companies with teams of 20-200 focused on pipeline predictability.",
        content_themes=[
            "Pipeline acceleration",
            "Campaign performance insights",
            "Cross-channel coordination",
            "Brand consistency at scale",
        ],
        platform_focus=["LinkedIn executive updates", "Meta proof points", "Lifecycle email touchpoints"],
        market_gaps=[
            "Most competitors post campaign announcements, but few publish post-mortem learning loops.",
            "Cross-platform narrative continuity is weak, leaving conversion intent under-captured.",
            "Educational mid-funnel assets are underused versus high-volume top-funnel posts.",
        ],
    )
    state.activities.insert(
        0,
        ActivityItem(
            id=f"act-{uuid.uuid4().hex[:8]}",
            text=f"Strategy refreshed for {state.company_name}",
            created_at=_iso(_now()),
        ),
    )
    _persist_state()
    return {"strategy": state.strategy.model_dump(), "competitors": [c.model_dump() for c in state.competitors]}


class ContentRequest(BaseModel):
    action: Literal["generate", "update", "create"] = "generate"
    content_id: Optional[str] = None
    title: Optional[str] = None
    content_text: Optional[str] = None
    calendar_days: Optional[int] = 14
    media_type: Optional[Literal["Image", "Video", "Carousel", "Media"]] = None
    media_preview: Optional[str] = None
    scheduled_at: Optional[str] = None
    auto_activate: Optional[bool] = False


@app.post("/content")
def post_content(body: ContentRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    if body.action == "create":
        title = (body.title or "").strip() or f"Campaign Asset {len(state.content) + 1}"
        content_text = (body.content_text or "").strip() or CONTENT_SNIPPETS[len(state.content) % len(CONTENT_SNIPPETS)]
        media_type = body.media_type or "Image"
        content_id = f"content-{uuid.uuid4().hex[:10]}"
        media_preview = (body.media_preview or "").strip() or f"https://picsum.photos/seed/mcc-{uuid.uuid4().hex[:8]}/640/360"
        if media_preview.startswith(("data:image/", "data:video/")):
            try:
                _refresh_runtime_env()
                media_preview = _upload_media_preview_to_cloudinary(content_id, media_preview, media_type)
                _remember_cloudinary_media(title, media_preview, media_type)
            except Exception as e:  # noqa: BLE001
                raise HTTPException(status_code=400, detail=f"Cloudinary image upload failed: {e}") from e
        item = ContentItem(
            id=content_id,
            title=title,
            content_text=content_text,
            media_type=media_type,
            media_preview=media_preview,
            status="PENDING",
            selected_platform=None,
            scheduled_at=None,
        )
        if body.auto_activate:
            item.selected_platform = state.preferences.default_platform
            if body.scheduled_at:
                item.status = "SCHEDULED"
                item.scheduled_at = body.scheduled_at
            else:
                item.status = "APPROVED"
        state.content.insert(0, item)
        state.activities.insert(
            0,
            ActivityItem(
                id=f"act-{uuid.uuid4().hex[:8]}",
                text=f"Content created: {item.title}",
                created_at=_iso(_now()),
            ),
        )
        _persist_state()
        return {"content": [c.model_dump() for c in state.content]}

    if body.action == "update":
        if not body.content_id:
            raise HTTPException(status_code=400, detail="content_id required")
        for item in state.content:
            if item.id == body.content_id:
                if body.title is not None:
                    item.title = body.title
                if body.content_text is not None:
                    item.content_text = body.content_text
                if body.media_type is not None:
                    item.media_type = body.media_type
                if body.media_preview is not None:
                    media_preview = body.media_preview.strip()
                    if media_preview.startswith(("data:image/", "data:video/")):
                        try:
                            _refresh_runtime_env()
                            media_preview = _upload_media_preview_to_cloudinary(item.id, media_preview, item.media_type)
                            _remember_cloudinary_media(item.title, media_preview, item.media_type)
                        except Exception as e:  # noqa: BLE001
                            raise HTTPException(status_code=400, detail=f"Cloudinary image upload failed: {e}") from e
                    item.media_preview = media_preview
                    _remember_cloudinary_media(item.title, item.media_preview, item.media_type)

                if body.auto_activate:
                    item.selected_platform = item.selected_platform or state.preferences.default_platform
                    if body.scheduled_at:
                        item.status = "SCHEDULED"
                        item.scheduled_at = body.scheduled_at
                    else:
                        item.status = "APPROVED"
                        item.scheduled_at = None
                else:
                    item.status = "PENDING"
                    item.selected_platform = None
                    item.scheduled_at = None
                state.activities.insert(
                    0,
                    ActivityItem(
                        id=f"act-{uuid.uuid4().hex[:8]}",
                        text=f"Content updated: {item.title}",
                        created_at=_iso(_now()),
                    ),
                )
                _persist_state()
                return {"content": [c.model_dump() for c in state.content]}
        raise HTTPException(status_code=404, detail="Content not found")

    calendar_days = max(7, min(30, body.calendar_days or 14))
    total = calendar_days
    _refresh_runtime_env()
    ai_items = _ai_content_calendar(total) or []
    new_items: list[ContentItem] = []
    state.media_registry = set()
    for index in range(total):
        ai_item = ai_items[index] if index < len(ai_items) else {}
        media_url = f"https://picsum.photos/seed/mcc-{uuid.uuid4().hex[:8]}/640/360"
        while media_url in state.media_registry:
            media_url = f"https://picsum.photos/seed/mcc-{uuid.uuid4().hex[:8]}/640/360"
        content_id = f"content-{uuid.uuid4().hex[:10]}"
        media_type: Literal["Image", "Video", "Carousel", "Media"] = random.choice(["Image", "Carousel", "Media"])
        if _cloudinary_ready():
            try:
                media_url = _upload_media_preview_to_cloudinary(content_id, media_url, media_type)
                _remember_cloudinary_media(f"Campaign Asset {index + 1}", media_url, media_type)
            except Exception:
                pass
        state.media_registry.add(media_url)
        new_items.append(
            ContentItem(
                id=content_id,
                title=ai_item.get("title") or f"Campaign Asset {index + 1}",
                content_text=ai_item.get("content_text") or CONTENT_SNIPPETS[index % len(CONTENT_SNIPPETS)],
                media_type=media_type,
                media_preview=media_url,
                status="PENDING",
                selected_platform=None,
                scheduled_at=None,
            )
        )
    state.content = new_items
    state.activities.insert(
        0,
        ActivityItem(
            id=f"act-{uuid.uuid4().hex[:8]}",
            text=f"Generated {total}-day content calendar with non-repeating media",
            created_at=_iso(_now()),
        ),
    )
    _persist_state()
    return {"content": [c.model_dump() for c in state.content]}


class ApproveRequest(BaseModel):
    content_id: str
    platform: Optional[Literal["linkedin", "instagram", "facebook", "twitter"]] = None
    platforms: Optional[list[Literal["linkedin", "instagram", "facebook", "twitter"]]] = None


@app.post("/approve")
def post_approve(body: ApproveRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    raw_platforms = list(body.platforms or [])
    if body.platform and body.platform not in raw_platforms:
        raw_platforms.insert(0, body.platform)
    normalized_platforms: list[Literal["linkedin", "instagram", "facebook", "twitter"]] = []
    seen: set[str] = set()
    for platform in raw_platforms:
        if platform in seen:
            continue
        seen.add(platform)
        normalized_platforms.append(platform)
    if not normalized_platforms:
        raise HTTPException(status_code=400, detail="At least one platform is required")

    for item in state.content:
        if item.id == body.content_id:
            if item.status == "REJECTED":
                raise HTTPException(status_code=400, detail="Rejected content must be edited before approval")
            if item.status == "PUBLISHED":
                raise HTTPException(status_code=400, detail="Already published")
            item.status = "APPROVED"
            item.selected_platform = normalized_platforms[0]
            for extra_platform in normalized_platforms[1:]:
                state.content.insert(
                    0,
                    ContentItem(
                        id=f"content-{uuid.uuid4().hex[:8]}",
                        title=item.title,
                        content_text=item.content_text,
                        media_type=item.media_type,
                        media_preview=item.media_preview,
                        status="APPROVED",
                        selected_platform=extra_platform,
                        scheduled_at=item.scheduled_at,
                    ),
                )
            state.activities.insert(
                0,
                ActivityItem(
                    id=f"act-{uuid.uuid4().hex[:8]}",
                    text=f"Content approved: {item.title} ({', '.join(normalized_platforms)})",
                    created_at=_iso(_now()),
                ),
            )
            _persist_state()
            return {"content": [c.model_dump() for c in state.content]}
    raise HTTPException(status_code=404, detail="Content not found")


class RejectRequest(BaseModel):
    content_id: str


@app.post("/reject")
def post_reject(body: RejectRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    for item in state.content:
        if item.id == body.content_id:
            item.status = "REJECTED"
            item.selected_platform = None
            item.scheduled_at = None
            state.activities.insert(
                0,
                ActivityItem(
                    id=f"act-{uuid.uuid4().hex[:8]}",
                    text=f"Content rejected: {item.title}",
                    created_at=_iso(_now()),
                ),
            )
            _persist_state()
            return {"content": [c.model_dump() for c in state.content]}
    raise HTTPException(status_code=404, detail="Content not found")


class ScheduleRequest(BaseModel):
    content_id: str
    scheduled_at: str


@app.post("/schedule")
def post_schedule(body: ScheduleRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    for item in state.content:
        if item.id == body.content_id:
            if item.status not in ("APPROVED", "SCHEDULED"):
                raise HTTPException(status_code=400, detail="Only approved or already scheduled items can be scheduled")
            item.status = "SCHEDULED"
            item.scheduled_at = body.scheduled_at
            state.activities.insert(
                0,
                ActivityItem(
                    id=f"act-{uuid.uuid4().hex[:8]}",
                    text=f"Scheduled: {item.title}",
                    created_at=_iso(_now()),
                ),
            )
            _persist_state()
            return {"content": [c.model_dump() for c in state.content]}
    raise HTTPException(status_code=404, detail="Content not found")


@app.get("/schedule")
def get_schedule(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    rows = []
    for item in state.content:
        if item.scheduled_at and item.status in ("APPROVED", "SCHEDULED", "PUBLISHED"):
            rows.append(
                {
                    "content_id": item.id,
                    "title": item.title,
                    "scheduled_at": item.scheduled_at,
                    "platform": item.selected_platform,
                    "status": item.status,
                }
            )
    return {"scheduled": rows}


class PublishRequest(BaseModel):
    content_ids: list[str]


class CloudinaryUploadRequest(BaseModel):
    data_url: str
    file_name: Optional[str] = None
    media_type: Optional[Literal["Image", "Video", "Carousel", "Media"]] = None


class MediaLibraryRemoveRequest(BaseModel):
    asset_id: str


def _platform_connected(platform: str) -> bool:
    if platform == "linkedin":
        return state.linkedin.connected
    if platform in ("instagram", "facebook"):
        return state.meta.connected
    if platform == "twitter":
        return False
    return False


@app.post("/media/upload/cloudinary")
def post_upload_media_to_cloudinary(body: CloudinaryUploadRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    _refresh_runtime_env()
    if not _cloudinary_ready():
        raise HTTPException(status_code=400, detail="Cloudinary env is not configured")
    source = body.data_url.strip()
    if not source.startswith(("data:image/", "data:video/")):
        raise HTTPException(status_code=400, detail="Only image/video data URLs can be uploaded")
    media_type = body.media_type or ("Video" if source.startswith("data:video/") else "Image")
    stem = re.sub(r"[^a-zA-Z0-9_-]+", "-", (body.file_name or "media").rsplit(".", 1)[0]).strip("-")
    public_id = f"{stem or 'media'}-{uuid.uuid4().hex[:8]}"
    try:
        media_url = _upload_media_preview_to_cloudinary(public_id, source, media_type)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Cloudinary upload failed: {e}") from e
    _remember_cloudinary_media(body.file_name or "Cloudinary media", media_url, media_type)
    _persist_state()
    return {"media_url": media_url, "media_type": media_type, "folder": CLOUDINARY_FOLDER}


@app.post("/media/library/remove")
def post_remove_media_library_item(body: MediaLibraryRemoveRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    before = len(state.media_library)
    state.media_library = [asset for asset in state.media_library if asset.id != body.asset_id]
    removed = before - len(state.media_library)
    if removed:
        _persist_state()
    return {"removed": removed, "media_library": [m.model_dump() for m in state.media_library]}


@app.post("/publish")
def post_publish(body: PublishRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    _refresh_runtime_env()
    warnings: list[str] = []
    published = 0
    for cid in body.content_ids:
        item = next((c for c in state.content if c.id == cid), None)
        if not item:
            warnings.append(f"Unknown content id: {cid}")
            continue
        if item.status not in ("APPROVED", "SCHEDULED"):
            warnings.append(f"{item.title}: not approved or scheduled")
            continue
        if not item.selected_platform:
            warnings.append(f"{item.title}: platform not selected")
            continue
        if not _platform_connected(item.selected_platform):
            warnings.append(f"{item.title}: platform not connected")
            continue
        ok = True
        if item.selected_platform == "linkedin":
            ok, reason = _publish_to_linkedin(
                content_text=item.content_text,
                title=item.title,
                media_preview=item.media_preview,
                media_type=item.media_type,
            )
            if not ok:
                warnings.append(f"{item.title}: {reason}")
        elif item.selected_platform == "facebook":
            media_preview, precheck_warning, media_uploaded = _coerce_public_media_url_for_meta(
                item_id=item.id,
                title=item.title,
                platform="facebook",
                media_preview=item.media_preview,
                media_type=item.media_type,
            )
            if precheck_warning:
                warnings.append(precheck_warning)
            if media_preview is None:
                ok = False
                reason = "Facebook publish blocked: no valid public media URL available"
                warnings.append(f"{item.title}: {reason}")
                continue
            if media_uploaded:
                item.media_preview = media_preview
            ok, reason = _publish_to_facebook(
                content_text=item.content_text,
                title=item.title,
                media_preview=media_preview,
                media_type=item.media_type,
            )
            if not ok:
                warnings.append(f"{item.title}: {reason}")
                if "code=190" in reason or "subcode=463" in reason:
                    state.meta = IntegrationState(
                        connected=False,
                        account_name="Meta Reconnect Required",
                        account_handle="refresh META_PAGE_ACCESS_TOKEN and reconnect Meta",
                    )
        elif item.selected_platform == "instagram":
            media_preview, precheck_warning, media_uploaded = _coerce_public_media_url_for_meta(
                item_id=item.id,
                title=item.title,
                platform="instagram",
                media_preview=item.media_preview,
                media_type=item.media_type,
            )
            if precheck_warning:
                warnings.append(precheck_warning)
            if media_preview is None:
                ok = False
                reason = "Instagram publish blocked: no valid public media URL available"
                warnings.append(f"{item.title}: {reason}")
                continue
            if media_uploaded:
                item.media_preview = media_preview
            ok, reason = _publish_to_instagram(
                content_text=item.content_text,
                title=item.title,
                media_preview=media_preview,
                media_type=item.media_type,
            )
            if not ok:
                warnings.append(f"{item.title}: {reason}")
                if "code=190" in reason or "subcode=463" in reason:
                    state.meta = IntegrationState(
                        connected=False,
                        account_name="Meta Reconnect Required",
                        account_handle="refresh META_PAGE_ACCESS_TOKEN and reconnect Meta",
                    )
        else:
            ok = False
            warnings.append(f"{item.title}: unsupported platform '{item.selected_platform}'")
        status: Literal["Success", "Failed"] = "Success" if ok else "Failed"
        state.publishing_log.insert(
            0,
            PublishingLogItem(
                id=f"pub-{uuid.uuid4().hex[:10]}",
                content_id=item.id,
                platform=item.selected_platform,
                timestamp=_iso(_now()),
                status=status,
            ),
        )
        if ok:
            item.status = "PUBLISHED"
            item.scheduled_at = None
            published += 1
            state.activities.insert(
                0,
                ActivityItem(
                    id=f"act-{uuid.uuid4().hex[:8]}",
                    text=f"Post published ({item.selected_platform})",
                    created_at=_iso(_now()),
                ),
            )
            new_leads = random.randint(1, 3)
            for _ in range(new_leads):
                name = random.choice(LEAD_NAMES)
                state.leads.insert(
                    0,
                    LeadItem(
                        id=f"lead-{uuid.uuid4().hex[:10]}",
                        name=name,
                        email=f"{name.lower().replace(' ', '.')}@businessmail.test",
                        source=item.title,
                        status="New",
                        crm_status="Pending",
                        captured_at=_iso(_now()),
                    ),
                )
                state.activities.insert(
                    0,
                    ActivityItem(
                        id=f"act-{uuid.uuid4().hex[:8]}",
                        text=f"Lead captured: {name}",
                        created_at=_iso(_now()),
                    ),
                )
    _persist_state()
    return {
        "content": [c.model_dump() for c in state.content],
        "leads": [l.model_dump() for l in state.leads],
        "publishing_log": [p.model_dump() for p in state.publishing_log],
        "published_count": published,
        "warnings": warnings,
    }


@app.post("/media/migrate/cloudinary")
def post_migrate_media_to_cloudinary(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    _refresh_runtime_env()
    if not _cloudinary_ready():
        raise HTTPException(status_code=400, detail="Cloudinary env is not configured")

    migrated = 0
    warnings: list[str] = []
    for item in state.content:
        media_preview = item.media_preview.strip()
        if not media_preview:
            continue
        if media_preview.startswith(("http://", "https://")) and _is_cloudinary_url(media_preview):
            continue
        if not (media_preview.startswith(("data:image/", "data:video/")) or media_preview.startswith(("http://", "https://"))):
            warnings.append(f"{item.title}: skipped unsupported media_preview format")
            continue
        try:
            item.media_preview = _upload_media_preview_to_cloudinary(item.id, media_preview, item.media_type)
            _remember_cloudinary_media(item.title, item.media_preview, item.media_type)
            migrated += 1
        except Exception as e:  # noqa: BLE001
            warnings.append(f"{item.title}: Cloudinary upload failed ({e})")

    if migrated:
        state.activities.insert(
            0,
            ActivityItem(
                id=f"act-{uuid.uuid4().hex[:8]}",
                text=f"Media migrated to Cloudinary ({migrated} assets)",
                created_at=_iso(_now()),
            ),
        )
    _persist_state()
    return {"migrated_count": migrated, "warnings": warnings, "content": [c.model_dump() for c in state.content]}


@app.get("/leads")
def get_leads(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    return {"leads": [l.model_dump() for l in state.leads]}


@app.post("/connect/linkedin")
def connect_linkedin(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    if _linkedin_ready():
        state.linkedin = IntegrationState(
            connected=True,
            account_name="LinkedIn Real API",
            account_handle=LINKEDIN_AUTHOR_URN,
        )
        _persist_state()
        return {"integrations": {"linkedin": state.linkedin.model_dump(), "meta": state.meta.model_dump()}}
    state.linkedin = IntegrationState(
        connected=True,
        account_name="LinkedIn Mock",
        account_handle="set LINKEDIN_* env vars for real posting",
    )
    _persist_state()
    return {"integrations": {"linkedin": state.linkedin.model_dump(), "meta": state.meta.model_dump()}}


@app.post("/connect/meta")
def connect_meta(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    _refresh_runtime_env()
    if _meta_ready():
        handles: list[str] = []
        if META_PAGE_ID:
            handles.append(f"page:{META_PAGE_ID}")
        if META_IG_BUSINESS_ACCOUNT_ID:
            handles.append(f"ig:{META_IG_BUSINESS_ACCOUNT_ID}")
        state.meta = IntegrationState(
            connected=True,
            account_name="Meta Graph API",
            account_handle=", ".join(handles) if handles else "configured",
        )
    else:
        state.meta = IntegrationState(
            connected=False,
            account_name="Meta Not Connected",
            account_handle="set valid META_* env vars and reconnect",
        )
    _persist_state()
    return {"integrations": {"linkedin": state.linkedin.model_dump(), "meta": state.meta.model_dump()}}


class CrmSyncRequest(BaseModel):
    lead_ids: Optional[list[str]] = None


@app.post("/crm/sync")
def post_crm_sync(body: CrmSyncRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    targets = body.lead_ids
    updated = 0
    for lead in state.leads:
        if targets is None or lead.id in targets:
            if lead.crm_status == "Pending":
                lead.crm_status = "Synced"
                updated += 1
    state.crm_last_bulk_status = "Synced"
    state.activities.insert(
        0,
        ActivityItem(
            id=f"act-{uuid.uuid4().hex[:8]}",
            text=f"CRM sync completed ({updated} records)",
            created_at=_iso(_now()),
        ),
    )
    _persist_state()
    return {"leads": [l.model_dump() for l in state.leads], "crm_last_bulk_status": state.crm_last_bulk_status, "updated": updated}


class ProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    timezone: Optional[str] = None


@app.get("/profile")
def get_profile(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _auth_user(authorization)
    data = state.profile.model_dump()
    if not data.get("email"):
        data["email"] = user["email"]
    if not data.get("name"):
        data["name"] = user["name"]
    return {"profile": data}


@app.post("/profile")
def post_profile(body: ProfileRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _auth_user(authorization)
    data = state.profile.model_dump()
    if body.name is not None:
        data["name"] = body.name
    if body.email is not None:
        data["email"] = body.email.strip().lower()
    if body.company is not None:
        data["company"] = body.company
    if body.timezone is not None:
        data["timezone"] = body.timezone
    if not data.get("email"):
        data["email"] = user["email"]
    if not data.get("name"):
        data["name"] = user["name"]
    state.profile = ProfileState(**data)
    _persist_state()
    return {"profile": state.profile.model_dump()}


class PreferencesRequest(BaseModel):
    default_platform: Optional[Literal["linkedin", "instagram", "facebook", "twitter"]] = None
    quiet_hours_enabled: Optional[bool] = None
    approval_digest: Optional[Literal["instant", "daily"]] = None


@app.post("/preferences")
def post_preferences(body: PreferencesRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    data = state.preferences.model_dump()
    if body.default_platform is not None:
        data["default_platform"] = body.default_platform
    if body.quiet_hours_enabled is not None:
        data["quiet_hours_enabled"] = body.quiet_hours_enabled
    if body.approval_digest is not None:
        data["approval_digest"] = body.approval_digest
    state.preferences = PreferencesState(**data)
    _persist_state()
    return {"preferences": state.preferences.model_dump()}


@app.post("/cron/run")
def post_cron_run(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _auth_user(authorization)
    now = _now()
    due: list[str] = []
    for item in state.content:
        if item.status not in ("SCHEDULED", "APPROVED") or not item.scheduled_at:
            continue
        try:
            scheduled = datetime.fromisoformat(item.scheduled_at.replace("Z", "+00:00"))
        except Exception:
            continue
        if scheduled <= now:
            due.append(item.id)
    if not due:
        state.activities.insert(
            0,
            ActivityItem(
                id=f"act-{uuid.uuid4().hex[:8]}",
                text="Cron cycle completed: no approved posts due",
                created_at=_iso(_now()),
            ),
        )
        _persist_state()
        return {"published_count": 0, "warnings": []}
    result = post_publish(PublishRequest(content_ids=due), authorization)
    state.activities.insert(
        0,
        ActivityItem(
            id=f"act-{uuid.uuid4().hex[:8]}",
            text=f"Cron cycle auto-published {result['published_count']} post(s)",
            created_at=_iso(_now()),
        ),
    )
    _persist_state()
    return {"published_count": result["published_count"], "warnings": result["warnings"]}
