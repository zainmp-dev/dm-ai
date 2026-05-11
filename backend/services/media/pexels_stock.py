"""Best-effort Pexels lookups when calendar posts lack a trustworthy media URL."""

from __future__ import annotations

import logging
import re

import requests

from config import settings

logger = logging.getLogger(__name__)

_BAD_QUERY_CHARS = re.compile(r"[^\w\s.-]", re.UNICODE)


def _sanitize_query(parts: list[str]) -> str:
    raw = " ".join(p.strip() for p in parts if p and str(p).strip())
    raw = _BAD_QUERY_CHARS.sub(" ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:280] or "business professional"


def _pexels_headers() -> dict[str, str] | None:
    key = (getattr(settings, "pexels_api_key", "") or "").strip()
    if not key:
        return None
    return {"Authorization": key}


def search_pexels_image_url(query: str, *, timeout: int = 12) -> str:
    headers = _pexels_headers()
    if not headers:
        return ""
    q = _sanitize_query([query])
    try:
        r = requests.get(
            "https://api.pexels.com/v1/search",
            headers=headers,
            params={"query": q, "per_page": 1, "orientation": "landscape"},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        logger.warning("pexels image search failed: %s", exc)
        return ""
    if r.status_code >= 400:
        logger.warning("pexels image HTTP %s: %s", r.status_code, (r.text or "")[:200])
        return ""
    try:
        data = r.json()
        photos = data.get("photos") if isinstance(data, dict) else None
        if not photos or not isinstance(photos[0], dict):
            return ""
        src = photos[0].get("src") if isinstance(photos[0].get("src"), dict) else {}
        url = str((src or {}).get("large") or (src or {}).get("original") or "").strip()
        if url.startswith("http://"):
            url = "https://" + url[7:]
        return url if url.startswith("https://") else ""
    except Exception as exc:
        logger.warning("pexels image parse failed: %s", exc)
        return ""


def search_pexels_video_url(query: str, *, timeout: int = 12) -> str:
    """Returns an https MP4 URL suitable for preview (SD or HD clip)."""
    headers = _pexels_headers()
    if not headers:
        return ""
    q = _sanitize_query([query])
    try:
        r = requests.get(
            "https://api.pexels.com/videos/search",
            headers=headers,
            params={"query": q, "per_page": 1},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        logger.warning("pexels video search failed: %s", exc)
        return ""
    if r.status_code >= 400:
        logger.warning("pexels video HTTP %s: %s", r.status_code, (r.text or "")[:200])
        return ""
    try:
        data = r.json()
        vids = data.get("videos") if isinstance(data, dict) else None
        if not vids or not isinstance(vids[0], dict):
            return ""
        files = vids[0].get("video_files")
        if not isinstance(files, list) or not files:
            # Fall back to Pexels image preview for thumbnail-only use
            thumbs = vids[0].get("image")
            if isinstance(thumbs, str) and thumbs.startswith("https://"):
                return thumbs
            return ""
        candidates: list[dict] = [f for f in files if isinstance(f, dict) and str(f.get("link", "")).startswith("https://")]
        if not candidates:
            return ""
        # Prefer readable HD-ish mp4 then smallest file
        def sort_key(row: dict) -> tuple[int, int]:
            h = int(row.get("height") or 0)
            sz = int(row.get("file_size") or 0)
            return (-min(h, 1080), sz)

        candidates.sort(key=sort_key)
        link = str(candidates[0].get("link", "")).strip()
        return link if link.startswith("https://") else ""
    except Exception as exc:
        logger.warning("pexels video parse failed: %s", exc)
        return ""


def search_pexels_for_post(
    *,
    query: str,
    media_type: str,
    timeout: int = 12,
) -> str:
    mt = (media_type or "Image").strip()
    if mt not in {"Image", "Video", "Carousel"}:
        mt = "Image"
    if mt == "Video":
        return search_pexels_video_url(query, timeout=timeout)
    return search_pexels_image_url(query, timeout=timeout)
