from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests

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
    body_text = (post.content or "").strip()
    share: dict[str, Any] = {
        "shareCommentary": {"text": body_text[:3000] if body_text else "•"},
        "shareMediaCategory": "NONE",
    }
    # Link-style share lets LinkedIn render a preview from a public https URL (image or page).
    if resolved and resolved.startswith("https://") and not _looks_like_video(resolved):
        share["shareMediaCategory"] = "ARTICLE"
        share["media"] = [
            {
                "status": "READY",
                "originalUrl": resolved,
                "title": {"text": (body_text[:200] if body_text else "Post")},
            }
        ]
    elif warn:
        extra = "[Media could not be attached: {}]".format(warn.strip())
        share["shareCommentary"]["text"] = (body_text + "\n\n" + extra).strip()[:3000]

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
                "Authorization": f"Bearer {settings.linkedin_access_token}",
                "Content-Type": "application/json",
                "LinkedIn-Version": settings.linkedin_api_version,
                "X-Restli-Protocol-Version": "2.0.0",
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
