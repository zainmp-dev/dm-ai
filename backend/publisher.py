from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests
import re
import time

from config import fresh_settings
from database import Content


@dataclass(frozen=True)
class PublishResult:
    success: bool
    message: str
    provider_response: dict[str, Any] | None = None


def _request_json(method: str, url: str, *, request_timeout: int, **kwargs: Any) -> dict[str, Any]:
    try:
        response = requests.request(method, url, timeout=request_timeout, **kwargs)
        response.raise_for_status()
        if not response.text:
            return {}
        data = response.json()
    except requests.Timeout as exc:
        raise RuntimeError("Publisher request timed out") from exc
    except requests.RequestException as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise RuntimeError(detail) from exc
    except ValueError as exc:
        raise RuntimeError("Publisher returned invalid JSON") from exc

    if isinstance(data, dict) and data.get("error"):
        err = data["error"]
        if isinstance(err, dict):
            msg = err.get("error_user_msg") or err.get("message") or str(err)
            code = err.get("code")
            hint = f"{msg}" + (f" (code {code})" if code is not None else "")
            raise RuntimeError(hint[:900])
        raise RuntimeError(str(err)[:500])
    return data if isinstance(data, dict) else {"response": data}


def _request_bytes(method: str, url: str, *, request_timeout: int, **kwargs: Any) -> tuple[bytes, str | None]:
    try:
        response = requests.request(method, url, timeout=request_timeout, **kwargs)
        response.raise_for_status()
    except requests.Timeout as exc:
        raise RuntimeError("Publisher request timed out") from exc
    except requests.RequestException as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise RuntimeError(detail) from exc
    return response.content, response.headers.get("Content-Type")


def _linkedin_headers(access_token: str, api_version: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "LinkedIn-Version": api_version,
        "X-Restli-Protocol-Version": "2.0.0",
    }


def _register_linkedin_asset(
    *,
    access_token: str,
    author_urn: str,
    api_version: str,
    recipe: str,
    request_timeout: int,
) -> tuple[str, str]:
    payload = {
        "registerUploadRequest": {
            "owner": author_urn,
            "recipes": [recipe],
            "serviceRelationships": [
                {
                    "relationshipType": "OWNER",
                    "identifier": "urn:li:userGeneratedContent",
                }
            ],
        }
    }
    data = _request_json(
        "POST",
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        headers={**_linkedin_headers(access_token, api_version), "Content-Type": "application/json"},
        json=payload,
        request_timeout=request_timeout,
    )
    value = data.get("value") if isinstance(data, dict) else None
    if not isinstance(value, dict):
        raise RuntimeError("LinkedIn upload registration returned an unexpected response")
    asset = value.get("asset")
    upload_mechanism = value.get("uploadMechanism")
    if not asset or not isinstance(upload_mechanism, dict):
        raise RuntimeError("LinkedIn upload registration did not return asset details")
    upload_req = upload_mechanism.get("com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest")
    if not isinstance(upload_req, dict) or not upload_req.get("uploadUrl"):
        raise RuntimeError("LinkedIn upload registration did not return upload URL")
    return str(asset), str(upload_req["uploadUrl"])


def _upload_linkedin_media_from_url(
    *,
    media_url: str,
    upload_url: str,
    access_token: str,
    api_version: str,
    expected_mime_prefix: str,
    request_timeout: int,
) -> None:
    raw, media_type = _request_bytes("GET", media_url, request_timeout=request_timeout)
    if not raw:
        raise RuntimeError("LinkedIn media upload failed: source file is empty")
    ct = (media_type or "").split(";", 1)[0].strip().lower()
    if ct and not ct.startswith(expected_mime_prefix):
        raise RuntimeError(f"LinkedIn requires {expected_mime_prefix.rstrip('/')} media, got content type '{ct}'")
    try:
        response = requests.put(
            upload_url,
            data=raw,
            headers={
                "Content-Type": ct or "application/octet-stream",
            },
            timeout=request_timeout,
        )
        response.raise_for_status()
    except requests.Timeout as exc:
        raise RuntimeError("LinkedIn media upload timed out") from exc
    except requests.RequestException as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        raise RuntimeError(f"LinkedIn media upload failed: {detail}") from exc


def _linkedin_asset_id_from_urn(asset_urn: str) -> str:
    # urn:li:digitalmediaAsset:<id>
    return asset_urn.rsplit(":", 1)[-1].strip()


def _linkedin_wait_asset_ready(
    *,
    access_token: str,
    api_version: str,
    asset_urn: str,
    request_timeout: int,
    max_wait_seconds: int = 20,
) -> None:
    asset_id = _linkedin_asset_id_from_urn(asset_urn)
    deadline = time.time() + max_wait_seconds
    last_state = "UNKNOWN"
    while time.time() < deadline:
        data = _request_json(
            "GET",
            f"https://api.linkedin.com/v2/assets/{asset_id}",
            headers=_linkedin_headers(access_token, api_version),
            request_timeout=request_timeout,
        )
        status_obj = data.get("status")
        status_str = str(status_obj).upper() if status_obj is not None else ""
        if "ALLOWED" in status_str or "AVAILABLE" in status_str or "READY" in status_str:
            return
        if "BLOCKED" in status_str or "FAILED" in status_str:
            raise RuntimeError(f"LinkedIn asset processing failed: {status_str}")
        last_state = status_str or last_state
        time.sleep(1.0)
    # Do not hard-fail if status endpoint is eventually consistent; publish attempt may still succeed.
    if last_state not in {"UNKNOWN", ""}:
        return


def _remove_exact_url_from_text(text: str, url: str) -> str:
    if not text or not url:
        return text
    variants = {url.strip()}
    if url.startswith("https://"):
        variants.add("http://" + url[8:])
    if url.startswith("http://"):
        variants.add("https://" + url[7:])
    out = text
    for v in variants:
        out = out.replace(v, " ")
    # Collapse whitespace/newlines so formatting stays clean after URL removal.
    out = "\n".join(" ".join(line.split()) for line in out.splitlines())
    out = "\n".join(line for line in out.splitlines() if line.strip())
    return out.strip()


def _remove_all_urls_from_text(text: str) -> str:
    if not text:
        return text
    out = re.sub(r"https?://[^\s]+", " ", text, flags=re.IGNORECASE)
    out = "\n".join(" ".join(line.split()) for line in out.splitlines())
    out = "\n".join(line for line in out.splitlines() if line.strip())
    return out.strip()


def _media_url_reachable_by_meta(url: str | None) -> bool:
    """Graph API fetches image/video URLs from Meta servers — localhost and relative paths fail."""
    if not url:
        return True
    u = url.strip().lower()
    if u.startswith("/") or u.startswith("file:"):
        return False
    if "localhost" in u or "127.0.0.1" in u or ".local/" in u:
        return False
    return u.startswith("http://") or u.startswith("https://")


def resolve_publish_media_url(raw: str | None) -> tuple[str | None, str | None]:
    """Turn stored app paths (/api/backend/media-assets/...) into absolute HTTPS URLs for Graph + LinkedIn.

    Returns (url, warning_or_none). `data:` URLs cannot be fetched by Meta/LinkedIn from the internet — caller should skip or ingest to CDN elsewhere.
    """
    settings = fresh_settings()
    if not raw:
        return None, None
    s = str(raw).strip()
    if not s:
        return None, None
    lower = s.lower()
    if lower.startswith("data:"):
        return None, "data:image/… URLs cannot be posted to Meta/LinkedIn (no public HTTP URL); use Cloudinary or an https link."
    if lower.startswith("/api/backend") or lower.startswith("/api/backend/"):
        base = (settings.public_app_origin or "").strip().rstrip("/")
        if not base:
            return None, (
                "Media is stored as a relative app path (/api/backend/…). "
                "Set FLOWPILOT_PUBLIC_ORIGIN to your public HTTPS app URL (no trailing slash) so Meta can fetch images. "
                "Example in production: https://app.example.com."
            )
        return f"{base}{s}", None
    # Other root-relative uploads (unlikely)
    if s.startswith("/") and "media-assets" in s:
        base = (settings.public_app_origin or "").strip().rstrip("/")
        if not base:
            return None, "Relative media URL requires FLOWPILOT_PUBLIC_ORIGIN for external networks."
        return f"{base}{s}", None
    if lower.startswith("http://"):
        s = "https://" + s[7:]
    if lower.startswith("https://"):
        return s, None
    return None, None


def publish_facebook(post: Content) -> PublishResult:
    settings = fresh_settings()
    if not settings.meta_page_access_token or not settings.meta_page_id:
        return PublishResult(False, "Missing META_PAGE_ACCESS_TOKEN or META_PAGE_ID")

    resolved, warn = resolve_publish_media_url(post.media_url)
    if warn:
        return PublishResult(False, f"Facebook: {warn}")
    photo_url = resolved
    if photo_url and not _media_url_reachable_by_meta(photo_url):
        return PublishResult(
            False,
            "Facebook needs a public HTTPS URL for the image. Localhost and private IPs cannot be fetched by Meta servers.",
        )

    base_url = f"https://graph.facebook.com/{settings.meta_graph_api_version}/{settings.meta_page_id}"
    try:
        if photo_url:
            payload = {
                "url": photo_url,
                "caption": post.content,
                "access_token": settings.meta_page_access_token,
                "published": "true",
            }
            data = _request_json("POST", f"{base_url}/photos", data=payload, request_timeout=settings.request_timeout_seconds)
        else:
            payload = {
                "message": post.content,
                "access_token": settings.meta_page_access_token,
            }
            data = _request_json("POST", f"{base_url}/feed", data=payload, request_timeout=settings.request_timeout_seconds)
    except RuntimeError as exc:
        return PublishResult(False, f"Facebook publish failed: {exc}")

    return PublishResult(True, "Facebook post published", data)


def publish_instagram(post: Content) -> PublishResult:
    settings = fresh_settings()
    if not settings.meta_page_access_token or not settings.meta_ig_business_account_id:
        return PublishResult(False, "Missing META_PAGE_ACCESS_TOKEN or META_IG_BUSINESS_ACCOUNT_ID")
    if not post.media_url:
        return PublishResult(False, "Instagram publishing requires media_url")

    resolved, warn = resolve_publish_media_url(post.media_url)
    if warn:
        return PublishResult(False, f"Instagram: {warn}")
    media_url_use = resolved
    if not media_url_use:
        return PublishResult(False, "Instagram publishing requires media_url")
    if not _media_url_reachable_by_meta(media_url_use):
        return PublishResult(
            False,
            "Instagram needs a public HTTPS URL for the image or video (not localhost/private). Ensure FLOWPILOT_PUBLIC_ORIGIN is your real public app URL.",
        )

    base_url = f"https://graph.facebook.com/{settings.meta_graph_api_version}/{settings.meta_ig_business_account_id}"
    try:
        create_payload = {
            "caption": post.content[:2200],
            "access_token": settings.meta_page_access_token,
        }
        if _looks_like_video(media_url_use):
            create_payload["media_type"] = "REELS"
            create_payload["video_url"] = media_url_use
        else:
            create_payload["image_url"] = media_url_use

        container = _request_json("POST", f"{base_url}/media", data=create_payload, request_timeout=settings.request_timeout_seconds)
        creation_id = container.get("id")
        if not creation_id:
            return PublishResult(False, "Instagram media container was not created", container)

        published = _request_json(
            "POST",
            f"{base_url}/media_publish",
            data={"creation_id": creation_id, "access_token": settings.meta_page_access_token},
            request_timeout=settings.request_timeout_seconds,
        )
    except RuntimeError as exc:
        return PublishResult(False, f"Instagram publish failed: {exc}")

    return PublishResult(True, "Instagram post published", published)


def publish_linkedin(post: Content) -> PublishResult:
    settings = fresh_settings()
    if not settings.linkedin_access_token or not settings.linkedin_author_urn:
        return PublishResult(False, "Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_AUTHOR_URN")

    resolved, warn = resolve_publish_media_url(post.media_url)
    if post.media_url and warn:
        return PublishResult(False, f"LinkedIn: {warn}")
    body_text = (post.content or "").strip()
    if resolved:
        # Any URL in commentary can trigger link preview cards and hide media.
        body_text = _remove_exact_url_from_text(body_text, resolved)
        body_text = _remove_all_urls_from_text(body_text)
    share: dict[str, Any] = {
        "shareCommentary": {"text": body_text[:3000] if body_text else "•"},
        "shareMediaCategory": "NONE",
    }
    if resolved and resolved.startswith("https://"):
        try:
            is_video = _looks_like_video(resolved)
            recipe = (
                "urn:li:digitalmediaRecipe:feedshare-video"
                if is_video
                else "urn:li:digitalmediaRecipe:feedshare-image"
            )
            asset, upload_url = _register_linkedin_asset(
                access_token=settings.linkedin_access_token,
                author_urn=settings.linkedin_author_urn,
                api_version=settings.linkedin_api_version,
                recipe=recipe,
                request_timeout=settings.request_timeout_seconds,
            )
            _upload_linkedin_media_from_url(
                media_url=resolved,
                upload_url=upload_url,
                access_token=settings.linkedin_access_token,
                api_version=settings.linkedin_api_version,
                expected_mime_prefix="video/" if is_video else "image/",
                request_timeout=settings.request_timeout_seconds,
            )
            _linkedin_wait_asset_ready(
                access_token=settings.linkedin_access_token,
                api_version=settings.linkedin_api_version,
                asset_urn=asset,
                request_timeout=settings.request_timeout_seconds,
            )
        except RuntimeError as exc:
            return PublishResult(False, f"LinkedIn media upload failed: {exc}")
        share["shareMediaCategory"] = "VIDEO" if _looks_like_video(resolved) else "IMAGE"
        share["media"] = [
            {
                "status": "READY",
                "media": asset,
                "title": {"text": (body_text[:200] if body_text else "Post")},
            }
        ]
    payload = {
        "author": settings.linkedin_author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": share,
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }

    try:
        data = _request_json(
            "POST",
            "https://api.linkedin.com/v2/ugcPosts",
            headers={
                **_linkedin_headers(settings.linkedin_access_token, settings.linkedin_api_version),
                "Content-Type": "application/json",
            },
            json=payload,
            request_timeout=settings.request_timeout_seconds,
        )
    except RuntimeError as exc:
        return PublishResult(False, f"LinkedIn publish failed: {exc}")

    return PublishResult(True, "LinkedIn post published", data)


def publish_post(post: Content) -> PublishResult:
    platform = post.platform.lower().strip()
    if platform == "facebook":
        return publish_facebook(post)
    if platform == "instagram":
        return publish_instagram(post)
    if platform == "linkedin":
        return publish_linkedin(post)
    return PublishResult(False, f"Unsupported platform: {post.platform}")


def _looks_like_video(url: str) -> bool:
    lowered = url.lower().split("?", 1)[0]
    return lowered.endswith((".mp4", ".mov", ".m4v", ".webm"))
