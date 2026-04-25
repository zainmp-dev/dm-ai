from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests

from config import settings
from database import Content


@dataclass(frozen=True)
class PublishResult:
    success: bool
    message: str
    provider_response: dict[str, Any] | None = None


def _request_json(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
    try:
        response = requests.request(method, url, timeout=settings.request_timeout_seconds, **kwargs)
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
        raise RuntimeError(str(data["error"])[:500])
    return data if isinstance(data, dict) else {"response": data}


def publish_facebook(post: Content) -> PublishResult:
    if not settings.meta_page_access_token or not settings.meta_page_id:
        return PublishResult(False, "Missing META_PAGE_ACCESS_TOKEN or META_PAGE_ID")

    base_url = f"https://graph.facebook.com/{settings.meta_graph_api_version}/{settings.meta_page_id}"
    try:
        if post.media_url:
            payload = {
                "url": post.media_url,
                "caption": post.content,
                "access_token": settings.meta_page_access_token,
            }
            data = _request_json("POST", f"{base_url}/photos", data=payload)
        else:
            payload = {
                "message": post.content,
                "access_token": settings.meta_page_access_token,
            }
            data = _request_json("POST", f"{base_url}/feed", data=payload)
    except RuntimeError as exc:
        return PublishResult(False, f"Facebook publish failed: {exc}")

    return PublishResult(True, "Facebook post published", data)


def publish_instagram(post: Content) -> PublishResult:
    if not settings.meta_page_access_token or not settings.meta_ig_business_account_id:
        return PublishResult(False, "Missing META_PAGE_ACCESS_TOKEN or META_IG_BUSINESS_ACCOUNT_ID")
    if not post.media_url:
        return PublishResult(False, "Instagram publishing requires media_url")

    base_url = f"https://graph.facebook.com/{settings.meta_graph_api_version}/{settings.meta_ig_business_account_id}"
    try:
        create_payload = {
            "caption": post.content[:2200],
            "access_token": settings.meta_page_access_token,
        }
        if _looks_like_video(post.media_url):
            create_payload["media_type"] = "REELS"
            create_payload["video_url"] = post.media_url
        else:
            create_payload["image_url"] = post.media_url

        container = _request_json("POST", f"{base_url}/media", data=create_payload)
        creation_id = container.get("id")
        if not creation_id:
            return PublishResult(False, "Instagram media container was not created", container)

        published = _request_json(
            "POST",
            f"{base_url}/media_publish",
            data={"creation_id": creation_id, "access_token": settings.meta_page_access_token},
        )
    except RuntimeError as exc:
        return PublishResult(False, f"Instagram publish failed: {exc}")

    return PublishResult(True, "Instagram post published", published)


def publish_linkedin(post: Content) -> PublishResult:
    if not settings.linkedin_access_token or not settings.linkedin_author_urn:
        return PublishResult(False, "Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_AUTHOR_URN")

    payload = {
        "author": settings.linkedin_author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": post.content},
                "shareMediaCategory": "NONE",
            }
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
