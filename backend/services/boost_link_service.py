"""
Build external "boost" / view-on-network URLs from persisted publish payloads.

Read-only helpers: no posting, no token usage, no DB access.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote


def _as_dict(response: Any) -> dict[str, Any]:
    if response is None:
        return {}
    if isinstance(response, dict):
        return response
    if isinstance(response, str):
        try:
            parsed = json.loads(response)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def meta_facebook_boost_url(*, response: Any, page_id_hint: str = "") -> str | None:
    """
    Facebook Page feed returns id as "{page_id}_{post_story_fbid}".
    Instagram media_publish returns a single numeric id — not representable as /posts/{id}; returns None.
    """
    data = _as_dict(response)
    raw_id = str(data.get("id") or "").strip()
    if not raw_id:
        return None
    if "_" in raw_id:
        page_id, post_id = raw_id.split("_", 1)
        if page_id and post_id:
            return f"https://www.facebook.com/{page_id}/posts/{post_id}"
    # Do not guess Instagram permalinks from media id alone.
    if raw_id.isdigit():
        return None
    page = (page_id_hint or "").strip()
    if page and raw_id:
        return f"https://www.facebook.com/{page}/posts/{raw_id}"
    return None


def linkedin_boost_url(*, response: Any) -> str | None:
    """LinkedIn ugcPosts API returns `id` as a URN (e.g. urn:li:ugcPost:...)."""
    data = _as_dict(response)
    urn = str(data.get("id") or data.get("urn") or "").strip()
    if not urn.startswith("urn:"):
        return None
    encoded = quote(urn, safe="")
    return f"https://www.linkedin.com/feed/update/{encoded}"


def boost_url_for_target(*, platform: str, response: Any, meta_page_id_hint: str = "") -> str | None:
    p = (platform or "").strip().lower()
    if p == "linkedin":
        return linkedin_boost_url(response=response)
    if p in {"meta", "facebook", "instagram"}:
        return meta_facebook_boost_url(response=response, page_id_hint=meta_page_id_hint)
    return None
