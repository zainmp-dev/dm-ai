"""Blog CMS — data access, AI generation, and featured-image resolution."""

from __future__ import annotations

import hashlib
import html as html_module
import json
import logging
import re
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator
from urllib.parse import quote

import requests
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import settings
from database import SessionLocal
from services.ai.ai_service import AIServiceError, ai_service
from services.ai.prompt_builder import with_json_contract
from services.blog_prompts import (
    BLOG_TASK_TYPE,
    body_requirements,
    brand_name,
    is_generic_topic,
    metadata_requirements,
    official_sources_block,
    optimize_requirements,
    product_destinations_block,
)
from services.media.cloudinary_service import (
    BLOG_IMAGE_MAX_BYTES,
    is_valid_featured_image_url,
    upload_bytes_to_cloudinary,
)
from utils.ai_usage_limits import enforce_ai_usage_limit

logger = logging.getLogger(__name__)

BLOG_STATUSES = ("draft", "published", "scheduled", "archived")
_BAD_QUERY_CHARS = re.compile(r"[^\w\s.-]", re.UNICODE)
_SCRIPT_TAG_RE = re.compile(r"<script[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL)
_IFRAME_TAG_RE = re.compile(r"<iframe[^>]*>.*?</iframe>", re.IGNORECASE | re.DOTALL)
_ON_EVENT_ATTR_RE = re.compile(r"""\s+on\w+\s*=\s*(['"]).*?\1""", re.IGNORECASE | re.DOTALL)

BLOG_LIST_COLUMNS = """
    id, workspace_id, title, slug, author, keywords, category_id,
    meta_description, content, featured_image_url, status,
    views, clicks, published_at, created_at, updated_at
"""

BLOG_SUMMARY_COLUMNS = """
    id, workspace_id, title, slug, author, keywords, category_id,
    meta_description, featured_image_url, status,
    views, clicks, published_at, created_at, updated_at
"""

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

# Blog AI budgets — standard educational guides are 1200–2000 words.
BLOG_DEFAULT_WORD_COUNT = 1500
BLOG_MAX_WORD_COUNT = 2000
BLOG_METADATA_MAX_TOKENS = 1024
BLOG_BODY_MAX_TOKENS = 4096
BLOG_BODY_MIN_TOKENS = 1024


def _blog_body_max_tokens() -> int:
    configured = int(getattr(settings, "blog_generation_max_tokens", BLOG_BODY_MAX_TOKENS) or BLOG_BODY_MAX_TOKENS)
    return max(BLOG_BODY_MIN_TOKENS, min(configured, 8192))


BLOG_AVOID_TITLE_LIMIT = 5
BLOG_INTERNAL_LINK_CATALOG_LIMIT = 5


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", value.lower().strip())
    slug = re.sub(r"[\s_-]+", "-", slug)
    return slug.strip("-") or f"post-{uuid.uuid4().hex[:8]}"


def _plain_text(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").strip()


def sanitize_blog_content(html: str) -> str:
    """Strip dangerous tags/attributes from blog HTML before persistence."""
    cleaned = html or ""
    cleaned = _SCRIPT_TAG_RE.sub("", cleaned)
    cleaned = _IFRAME_TAG_RE.sub("", cleaned)
    cleaned = _ON_EVENT_ATTR_RE.sub("", cleaned)
    return cleaned


def _resolve_slug(raw_slug: Any, title: str) -> str:
    slug_source = str(raw_slug or "").strip() or title
    return _slugify(slug_source)


def validate_blog_payload(payload: dict[str, Any]) -> dict[str, Any]:
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    content = sanitize_blog_content(str(payload.get("content") or ""))
    if not _plain_text(content):
        raise HTTPException(status_code=400, detail="Content is required")

    image_url = str(payload.get("featured_image_url") or "").strip()
    if image_url and not is_valid_featured_image_url(image_url):
        raise HTTPException(status_code=400, detail="Invalid featured image URL")

    status = (payload.get("status") or "draft").lower()
    if status not in BLOG_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    slug = _resolve_slug(payload.get("slug"), title)

    return {
        **payload,
        "title": title[:500],
        "slug": slug[:200],
        "author": str(payload.get("author") or "").strip()[:200],
        "content": content,
        "meta_description": str(payload.get("meta_description") or "").strip()[:500],
        "featured_image_url": image_url,
        "status": status,
    }


@contextmanager
def _session() -> Generator[Session, None, None]:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _workspace_id(user: dict[str, Any]) -> str:
    return str(user["id"])


def _normalize_keywords(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(k).strip() for k in raw if str(k).strip()][:12]


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------


def _post_common_fields(row: dict[str, Any], category_name: str = "") -> dict[str, Any]:
    keywords = row.get("keywords") or []
    title = row.get("title") or ""
    stored_slug = str(row.get("slug") or "").strip()
    return {
        "id": str(row["id"]),
        "title": title,
        "slug": stored_slug if stored_slug else _slugify(title),
        "author": row.get("author") or "",
        "metaDescription": row.get("meta_description") or "",
        "image": row.get("featured_image_url") or "",
        "categoryId": str(row["category_id"]) if row.get("category_id") else "",
        "categoryName": category_name,
        "tags": list(keywords),
        "status": row.get("status") or "draft",
        "scheduledAt": None,
        "publishedAt": row["published_at"].isoformat() if row.get("published_at") else None,
        "views": int(row.get("views") or 0),
        "clicks": int(row.get("clicks") or 0),
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
        "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


def row_to_post(row: dict[str, Any], category_name: str = "") -> dict[str, Any]:
    content = row.get("content") or ""
    return {
        **_post_common_fields(row, category_name),
        "content": content,
        "description": _plain_text(content)[:150],
    }


def row_to_post_summary(row: dict[str, Any], category_name: str = "") -> dict[str, Any]:
    meta = str(row.get("meta_description") or "").strip()
    return {
        **_post_common_fields(row, category_name),
        "content": "",
        "description": meta[:150],
    }


def row_to_category(row: dict[str, Any], blog_count: int = 0) -> dict[str, Any]:
    name = row.get("name") or ""
    return {
        "id": str(row["id"]),
        "name": name,
        "slug": _slugify(name),
        "description": row.get("description") or "",
        "color": "#7c3aed",
        "icon": "folder",
        "status": "active",
        "blogCount": blog_count,
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def _category_name_map(db: Session, workspace_id: str) -> dict[str, str]:
    rows = db.execute(
        text("select id, name from flowpilot_categories where workspace_id = :ws"),
        {"ws": workspace_id},
    ).mappings().all()
    return {str(r["id"]): str(r.get("name") or "") for r in rows}


def list_blogs(
    workspace_id: str,
    *,
    status: str | None = None,
    page: int = 1,
    limit: int = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    page = max(1, page)
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    offset = (page - 1) * limit

    with _session() as db:
        params: dict[str, Any] = {"ws": workspace_id}
        conditions = ["b.workspace_id = :ws"]
        if status and status.lower() != "all":
            conditions.append("b.status = :status")
            params["status"] = status.lower()
        where = "where " + " and ".join(conditions)

        total = db.execute(
            text(f"select count(*)::int as cnt from flowpilot_blogs b {where}"),
            params,
        ).mappings().first()
        total_blogs = int((total or {}).get("cnt") or 0)
        total_pages = max(1, (total_blogs + limit - 1) // limit) if total_blogs else 1

        query = """
            select
              b.id, b.workspace_id, b.title, b.slug, b.author, b.keywords, b.category_id,
              b.meta_description, b.featured_image_url, b.status,
              b.views, b.clicks, b.published_at, b.created_at, b.updated_at,
              c.name as category_name
            from flowpilot_blogs b
            left join flowpilot_categories c on c.id = b.category_id and c.workspace_id = b.workspace_id
            """ + where + """
            order by b.updated_at desc
            limit :limit offset :offset
        """
        rows = db.execute(
            text(query),
            {**params, "limit": limit, "offset": offset},
        ).mappings().all()
        blogs = [
            row_to_post_summary(dict(r), str(r.get("category_name") or ""))
            for r in rows
        ]

    return {
        "blogs": blogs,
        "currentPage": page,
        "totalPages": total_pages,
        "totalBlogs": total_blogs,
    }


def list_blog_summaries(workspace_id: str) -> list[dict[str, Any]]:
    """Lightweight list for AI duplicate/tone checks — no full content body."""
    with _session() as db:
        rows = db.execute(
            text(
                """
                select b.id, b.title, b.slug, b.featured_image_url, c.name as category_name
                from flowpilot_blogs b
                left join flowpilot_categories c on c.id = b.category_id
                where b.workspace_id = :ws
                order by b.updated_at desc
                """
            ),
            {"ws": workspace_id},
        ).mappings().all()
        return [
            {
                "id": str(r["id"]),
                "title": r.get("title") or "",
                "slug": _resolve_slug(r.get("slug"), str(r.get("title") or "")),
                "category_name": r.get("category_name") or "",
                "image": r.get("featured_image_url") or "",
            }
            for r in rows
        ]


def list_linkable_blog_posts(workspace_id: str, *, exclude_post_id: str | None = None) -> list[dict[str, Any]]:
    """Published sibling posts for AI internal linking."""
    with _session() as db:
        rows = db.execute(
            text(
                """
                select b.id, b.title, b.slug, c.name as category_name
                from flowpilot_blogs b
                left join flowpilot_categories c on c.id = b.category_id
                where b.workspace_id = :ws and b.status in ('published', 'draft', 'scheduled')
                order by b.updated_at desc
                limit 20
                """
            ),
            {"ws": workspace_id},
        ).mappings().all()
    posts = [
        {
            "id": str(r["id"]),
            "title": r.get("title") or "",
            "slug": _resolve_slug(r.get("slug"), str(r.get("title") or "")),
            "category_name": r.get("category_name") or "",
        }
        for r in rows
    ]
    if exclude_post_id:
        posts = [p for p in posts if p["id"] != exclude_post_id]
    return posts


def get_blog(workspace_id: str, blog_id: str) -> dict[str, Any] | None:
    with _session() as db:
        row = db.execute(
            text(
                """
                select
                  b.id, b.workspace_id, b.title, b.slug, b.author, b.keywords, b.category_id,
                  b.meta_description, b.content, b.featured_image_url, b.status,
                  b.views, b.clicks, b.published_at, b.created_at, b.updated_at,
                  c.name as category_name
                from flowpilot_blogs b
                left join flowpilot_categories c on c.id = b.category_id and c.workspace_id = b.workspace_id
                where b.workspace_id = :ws and b.id = :id
                """
            ),
            {"ws": workspace_id, "id": blog_id},
        ).mappings().first()
        if not row:
            return None
        return row_to_post(dict(row), str(row.get("category_name") or ""))


def create_blog(workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    payload = validate_blog_payload(payload)
    now = _now()
    status = payload["status"]
    published_at = now if status == "published" else None
    blog_id = str(uuid.uuid4())

    with _session() as db:
        db.execute(
            text(
                """
                insert into flowpilot_blogs (
                    id, workspace_id, title, slug, author, keywords, category_id,
                    meta_description, content, featured_image_url, status,
                    published_at, created_at, updated_at
                ) values (
                    :id, :ws, :title, :slug, :author, :keywords, :category_id,
                    :meta_description, :content, :featured_image_url, :status,
                    :published_at, :created_at, :updated_at
                )
                """
            ),
            {
                "id": blog_id,
                "ws": workspace_id,
                "title": payload["title"],
                "slug": payload["slug"],
                "author": payload.get("author") or "",
                "keywords": payload.get("keywords") or [],
                "category_id": payload.get("category_id") or None,
                "meta_description": payload.get("meta_description") or "",
                "content": payload["content"],
                "featured_image_url": payload.get("featured_image_url") or "",
                "status": status,
                "published_at": published_at,
                "created_at": now,
                "updated_at": now,
            },
        )

    created = get_blog(workspace_id, blog_id)
    if not created:
        raise RuntimeError("Blog insert failed")
    return created


def update_blog(workspace_id: str, blog_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    existing = get_blog(workspace_id, blog_id)
    if not existing:
        return None

    merged = {
        "title": payload.get("title") if payload.get("title") is not None else existing["title"],
        "slug": payload.get("slug") if payload.get("slug") is not None else existing["slug"],
        "author": payload.get("author") if payload.get("author") is not None else existing["author"],
        "keywords": payload.get("keywords") if payload.get("keywords") is not None else existing["tags"],
        "category_id": payload.get("category_id") if "category_id" in payload else (existing["categoryId"] or None),
        "meta_description": (
            payload.get("meta_description")
            if payload.get("meta_description") is not None
            else existing["metaDescription"]
        ),
        "content": payload.get("content") if payload.get("content") is not None else existing["content"],
        "featured_image_url": (
            payload.get("featured_image_url")
            if payload.get("featured_image_url") is not None
            else existing["image"]
        ),
        "status": payload.get("status") if payload.get("status") is not None else existing["status"],
    }
    merged = validate_blog_payload(merged)

    status = merged["status"]
    published_at = existing.get("publishedAt")
    if status == "published" and not published_at:
        published_at = _now().isoformat()

    category_id = merged.get("category_id")
    if category_id == "":
        category_id = None

    with _session() as db:
        result = db.execute(
            text(
                """
                update flowpilot_blogs set
                    title = :title,
                    slug = :slug,
                    author = :author,
                    keywords = :keywords,
                    category_id = :category_id,
                    meta_description = :meta_description,
                    content = :content,
                    featured_image_url = :featured_image_url,
                    status = :status,
                    published_at = :published_at,
                    updated_at = :updated_at
                where workspace_id = :ws and id = :id
                returning id
                """
            ),
            {
                "ws": workspace_id,
                "id": blog_id,
                "title": merged["title"],
                "slug": merged["slug"],
                "author": merged.get("author") or "",
                "keywords": merged.get("keywords") or [],
                "category_id": category_id,
                "meta_description": merged.get("meta_description") or "",
                "content": merged["content"],
                "featured_image_url": merged.get("featured_image_url") or "",
                "status": status,
                "published_at": published_at,
                "updated_at": _now(),
            },
        )
        if not result.first():
            return None

    return get_blog(workspace_id, blog_id)


def delete_blog(workspace_id: str, blog_id: str) -> bool:
    with _session() as db:
        result = db.execute(
            text("delete from flowpilot_blogs where workspace_id = :ws and id = :id returning id"),
            {"ws": workspace_id, "id": blog_id},
        )
        return result.first() is not None


def list_categories(workspace_id: str, seed_defaults: bool = True) -> list[dict[str, Any]]:
    with _session() as db:
        cats = db.execute(
            text("select * from flowpilot_categories where workspace_id = :ws order by name asc"),
            {"ws": workspace_id},
        ).mappings().all()

        if not cats and seed_defaults:
            now = _now()
            defaults = [
                ("HR Trends", "Human resources insights and workplace culture."),
                ("Product Updates", "Product launches and announcements."),
            ]
            for name, desc in defaults:
                db.execute(
                    text(
                        """
                        insert into flowpilot_categories (id, workspace_id, name, description, created_at)
                        values (:id, :ws, :name, :desc, :created_at)
                        """
                    ),
                    {"id": str(uuid.uuid4()), "ws": workspace_id, "name": name, "desc": desc, "created_at": now},
                )
            return list_categories(workspace_id, seed_defaults=False)

        counts_rows = db.execute(
            text(
                """
                select category_id, count(*)::int as cnt
                from flowpilot_blogs
                where workspace_id = :ws and category_id is not null
                group by category_id
                """
            ),
            {"ws": workspace_id},
        ).mappings().all()
        counts = {str(r["category_id"]): int(r["cnt"]) for r in counts_rows}

        return [row_to_category(dict(c), counts.get(str(c["id"]), 0)) for c in cats]


def create_category(workspace_id: str, name: str, description: str = "") -> str:
    cat_id = str(uuid.uuid4())
    with _session() as db:
        db.execute(
            text(
                """
                insert into flowpilot_categories (id, workspace_id, name, description, created_at)
                values (:id, :ws, :name, :desc, :created_at)
                """
            ),
            {
                "id": cat_id,
                "ws": workspace_id,
                "name": name.strip(),
                "desc": description.strip(),
                "created_at": _now(),
            },
        )
    return cat_id


def update_category(workspace_id: str, category_id: str, name: str, description: str = "") -> bool:
    with _session() as db:
        result = db.execute(
            text(
                """
                update flowpilot_categories set name = :name, description = :desc
                where workspace_id = :ws and id = :id
                returning id
                """
            ),
            {"ws": workspace_id, "id": category_id, "name": name.strip(), "desc": description.strip()},
        )
        return result.first() is not None


def delete_category(workspace_id: str, category_id: str) -> bool:
    with _session() as db:
        db.execute(
            text("update flowpilot_blogs set category_id = null where workspace_id = :ws and category_id = :id"),
            {"ws": workspace_id, "id": category_id},
        )
        result = db.execute(
            text("delete from flowpilot_categories where workspace_id = :ws and id = :id returning id"),
            {"ws": workspace_id, "id": category_id},
        )
        return result.first() is not None


def upload_featured_image(workspace_id: str, file_bytes: bytes, file_name: str, content_type: str) -> str:
    """Upload blog featured image to Cloudinary; returns secure HTTPS URL."""
    del workspace_id  # workspace scoping is auth-level; folder uses CLOUDINARY_FOLDER/blog
    if len(file_bytes) > BLOG_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 10MB")
    return upload_bytes_to_cloudinary(file_bytes, file_name or "blog-image.jpg", content_type or "image/jpeg")


# ---------------------------------------------------------------------------
# Featured image (Pexels + Pollinations)
# ---------------------------------------------------------------------------


def _sanitize_image_query(parts: list[str]) -> str:
    raw = " ".join(p.strip() for p in parts if p and str(p).strip())
    raw = _BAD_QUERY_CHARS.sub(" ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:280] or "business professional"


def _pexels_headers() -> dict[str, str] | None:
    key = (getattr(settings, "pexels_api_key", "") or "").strip()
    if not key:
        return None
    return {"Authorization": key}


def _search_pexels_image_url(
    query: str,
    *,
    exclude_urls: set[str] | None = None,
    uniqueness_seed: str = "",
    timeout: int = 12,
) -> str:
    headers = _pexels_headers()
    if not headers:
        return ""
    q = _sanitize_image_query([query])
    blocked = {u.strip() for u in (exclude_urls or set()) if u and str(u).strip()}
    per_page = 15
    start_idx = 0
    if uniqueness_seed:
        start_idx = int(hashlib.sha256(uniqueness_seed.encode()).hexdigest(), 16) % per_page

    for page in range(1, 4):
        try:
            r = requests.get(
                "https://api.pexels.com/v1/search",
                headers=headers,
                params={"query": q, "per_page": per_page, "page": page, "orientation": "landscape"},
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
            if not photos or not isinstance(photos, list):
                break
            order = list(range(len(photos)))
            if page == 1 and order:
                order = [(start_idx + i) % len(photos) for i in range(len(photos))]
            for idx in order:
                photo = photos[idx]
                if not isinstance(photo, dict):
                    continue
                src = photo.get("src") if isinstance(photo.get("src"), dict) else {}
                url = str((src or {}).get("large") or (src or {}).get("original") or "").strip()
                if url.startswith("http://"):
                    url = "https://" + url[7:]
                if url.startswith("https://") and url not in blocked:
                    return url
        except Exception as exc:
            logger.warning("pexels image parse failed: %s", exc)
            return ""
    return ""


def _build_image_query(*, title: str, keywords: list[str], image_prompt: str, category: str) -> str:
    prompt = (image_prompt or "").strip()
    if prompt:
        return prompt[:400]
    parts = [title.strip(), category.strip(), *keywords[:4]]
    cleaned = " ".join(p for p in parts if p).strip()
    return cleaned[:400] or "professional business workplace"


def _pollinations_image_url(prompt: str, seed: str) -> str:
    safe_prompt = (
        "Professional editorial blog banner photograph, 16:9 widescreen, realistic, "
        "no text, no logos, no watermark. "
        f"{prompt}"
    )[:480]
    seed_hash = hashlib.sha256(seed.encode()).hexdigest()[:16]
    return (
        f"https://image.pollinations.ai/prompt/{quote(safe_prompt)}"
        f"?width=1200&height=630&seed={seed_hash}&nologo=true"
    )


def resolve_featured_image_url(
    *,
    title: str,
    keywords: list[str],
    image_prompt: str,
    category: str,
    used_image_urls: list[str] | None = None,
    uniqueness_nonce: str | None = None,
) -> str:
    query = _build_image_query(title=title, keywords=keywords, image_prompt=image_prompt, category=category)
    blocked = {u.strip() for u in (used_image_urls or []) if u and str(u).strip()}
    nonce = (uniqueness_nonce or uuid.uuid4().hex).strip()
    uniqueness_seed = f"{title}|{image_prompt}|{category}|{'|'.join(keywords[:6])}|{nonce}"

    pexels_url = _search_pexels_image_url(query, exclude_urls=blocked, uniqueness_seed=uniqueness_seed)
    if pexels_url and pexels_url not in blocked:
        return pexels_url

    pollinations_seed = f"{uniqueness_seed}|{_slugify(title)}|{nonce}"
    pollinations_url = _pollinations_image_url(query, pollinations_seed)
    if pollinations_url not in blocked:
        return pollinations_url

    return _pollinations_image_url(f"{query} {nonce[:8]}", f"{pollinations_seed}|fallback")


# ---------------------------------------------------------------------------
# AI generation
# ---------------------------------------------------------------------------


def _build_style_context(posts: list[dict[str, Any]]) -> str:
    if not posts:
        return (
            "No published posts yet — write a clear, practical OfficeKit HR educational guide. "
            "Help the reader first; mention the product only where it naturally solves the problem."
        )
    titles = [str(p.get("title") or "").strip() for p in posts if str(p.get("title") or "").strip()]
    categories = [str(p.get("category_name") or "").strip() for p in posts if str(p.get("category_name") or "").strip()]
    top_categories = list(dict.fromkeys(categories))[:5]
    return (
        f"Existing blog titles for tone reference: {', '.join(titles[:5]) or 'n/a'}.\n"
        f"Common categories: {', '.join(top_categories) or 'n/a'}."
    )


def _duplicate_title(title: str, posts: list[dict[str, Any]], exclude_post_id: str | None) -> str | None:
    needle = title.strip().lower()
    slug_needle = _slugify(title)
    for post in posts:
        if exclude_post_id and str(post.get("id")) == exclude_post_id:
            continue
        existing_title = str(post.get("title") or "").strip().lower()
        existing_slug = str(post.get("slug") or _slugify(str(post.get("title") or ""))).strip().lower()
        if existing_title == needle or existing_slug == slug_needle:
            return str(post.get("title") or title)
    return None


def _blog_post_href(post_id: str) -> str:
    return f"/blog/posts/{post_id}"


def _linkable_posts(posts: list[dict[str, Any]], exclude_post_id: str | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for post in posts:
        if exclude_post_id and str(post.get("id")) == exclude_post_id:
            continue
        post_id = str(post.get("id") or "").strip()
        title = str(post.get("title") or "").strip()
        if post_id and title:
            out.append(post)
    return out


def _build_internal_links_catalog(posts: list[dict[str, Any]], exclude_post_id: str | None) -> str:
    linkable = _linkable_posts(posts, exclude_post_id)
    if not linkable:
        return ""
    lines = [
        f'- "{p["title"]}" → <a href="{_blog_post_href(str(p["id"]))}">...</a>'
        for p in linkable[:BLOG_INTERNAL_LINK_CATALOG_LIMIT]
    ]
    return (
        "Internal linking catalog — weave at least 2 contextual in-body links using these exact paths:\n"
        + "\n".join(lines)
    )


def _has_internal_blog_links(content_html: str) -> bool:
    return bool(re.search(r"""href=["']/blog/posts/[^"']+["']""", content_html, re.IGNORECASE))


def _build_related_reading_block(posts: list[dict[str, Any]], exclude_post_id: str | None, limit: int = 3) -> str:
    linkable = _linkable_posts(posts, exclude_post_id)[:limit]
    if not linkable:
        return ""
    items = "".join(
        f'<li><a href="{_blog_post_href(str(p["id"]))}">{html_module.escape(str(p["title"]))}</a></li>'
        for p in linkable
    )
    return f'<h2>Related reading</h2><ul>{items}</ul>'


def _ensure_internal_links(
    content_html: str,
    posts: list[dict[str, Any]],
    exclude_post_id: str | None,
) -> str:
    """Guarantee internal links on every generated post when sibling posts exist."""
    if _has_internal_blog_links(content_html):
        return content_html
    block = _build_related_reading_block(posts, exclude_post_id)
    if not block:
        return content_html

    faq_match = re.search(r"<h2[^>]*>\s*Frequently\s+Asked\s+Questions", content_html, re.IGNORECASE)
    if faq_match:
        return content_html[: faq_match.start()] + block + content_html[faq_match.start() :]

    return content_html.rstrip() + block


def _extract_json_string_field(raw: str, field: str) -> str:
    text = _strip_json_fences(raw)
    complete = re.search(rf'"{re.escape(field)}"\s*:\s*"((?:\\.|[^"\\])*)"', text, re.DOTALL)
    if complete:
        try:
            return str(json.loads(f'"{complete.group(1)}"')).strip()
        except json.JSONDecodeError:
            return complete.group(1).replace('\\"', '"').replace("\\n", "\n").strip()

    truncated = re.search(rf'"{re.escape(field)}"\s*:\s*"((?:\\.|[^"\\])*)', text, re.DOTALL)
    if truncated:
        value = truncated.group(1).replace('\\"', '"').replace("\\n", "\n").strip()
        if value:
            return value
    return ""


def _generate_blog_body_html(
    *,
    generated_title: str,
    meta_description: str,
    keywords: list[str],
    user_prompt: str,
    website_name: str,
    style_context: str,
    internal_links_block: str,
    internal_links_requirement: str,
    preferred_model: str | None,
    target_words: int,
    selected_category: str | None = None,
) -> tuple[str, str]:
    brand = brand_name(website_name)
    primary = keywords[0] if keywords else "(none)"
    keyword_text = ", ".join(keywords[:8]) if keywords else "(none)"
    prompt = with_json_contract(
        (
            f"{style_context}\n"
            f"{internal_links_block}\n"
            f"{product_destinations_block(brand)}\n"
            f"{official_sources_block()}\n\n"
            f"{user_prompt}\n\n"
            f'Article title: "{generated_title}"\n'
            + (f'Selected category: "{selected_category.strip()}". Stay in this category.\n' if (selected_category or "").strip() else "")
            + f"Primary keyword: {primary}\n"
            f"Secondary keywords: {keyword_text}\n"
            f"Meta description: {meta_description}\n"
            f"Target length: ~{target_words} words.\n\n"
            f"{body_requirements(brand=brand, internal_links_requirement=internal_links_requirement, target_words=target_words)}\n"
            "Return ONLY contentHtml — the full article body as one HTML string.\n"
        ),
        schema_hint={
            "type": "object",
            "required": ["contentHtml"],
            "properties": {"contentHtml": {"type": "string"}},
        },
    )
    result = ai_service.retry_request(
        prompt=prompt,
        preferred_model=preferred_model,
        task_type=BLOG_TASK_TYPE,
        response_format={"type": "json_object"},
        prefer_groq_first=True,
        prefer_gemini=True,
        max_tokens=_blog_body_max_tokens(),
        context={"category": selected_category or "", "title": generated_title, "mode": "full-blog"},
    )
    try:
        payload = _parse_ai_json_payload(result.text, context="Blog body generation")
    except AIServiceError:
        payload = {}
    content_html = str(payload.get("contentHtml") or "").strip()
    if not content_html:
        content_html = _extract_json_string_field(result.text, "contentHtml").strip()
    return content_html, result.model_used


def generate_blog_content(
    *,
    mode: str,
    categories: list[str],
    existing_posts: list[dict[str, Any]],
    linkable_posts: list[dict[str, Any]] | None = None,
    website_name: str,
    preferred_model: str | None,
    topic: str | None = None,
    industry: str | None = None,
    audience: str | None = None,
    tone: str | None = None,
    word_count: int = BLOG_DEFAULT_WORD_COUNT,
    title: str | None = None,
    exclude_post_id: str | None = None,
    author_name: str = "",
    selected_category: str | None = None,
) -> dict[str, Any]:
    style_context = _build_style_context(existing_posts)
    posts_for_links = linkable_posts if linkable_posts is not None else existing_posts
    avoid_titles = [
        str(p.get("title") or "").strip()
        for p in existing_posts
        if str(p.get("title") or "").strip() and (not exclude_post_id or str(p.get("id")) != exclude_post_id)
    ]

    brand = brand_name(website_name)
    default_industry = "HRMS / Human Resource Management"
    default_audience = "HR managers, business owners, and payroll professionals"
    default_tone = "Clear, practical, expert, and non-promotional"

    if mode == "title":
        if not (title or "").strip():
            raise AIServiceError("Title is required for title-based generation")
        user_prompt = (
            f'Generate a complete, publish-ready blog post based on this title: "{title.strip()}".\n'
            "Identify the primary audience, search intent, and topic cluster before writing.\n"
            "Satisfy the dominant search intent. Help the reader before mentioning the product."
        )
        if (selected_category or "").strip():
            user_prompt += f'\nSelected category: "{selected_category.strip()}". Write for this category only.'
    else:
        topic_text = (topic or "").strip()
        if not topic_text:
            raise AIServiceError("Topic is required")
        if is_generic_topic(topic_text):
            user_prompt = (
                "No specific topic was provided. Select ONE high-value, search-led HR/HRMS topic "
                f"that helps {brand} build topical authority. Prefer Indian payroll, HRMS, attendance, "
                "leave, recruitment, or compliance queries with clear search intent and evergreen value.\n"
                "Do not choose a random or generic 'HR tips' topic.\n"
            )
        else:
            user_prompt = f"Topic: {topic_text}\n"
        user_prompt += (
            f"Industry: {(industry or default_industry).strip()}\n"
            f"Primary audience: {(audience or default_audience).strip()}\n"
            f"Tone: {(tone or default_tone).strip()}\n"
            f"Target length: ~{max(800, min(word_count, BLOG_MAX_WORD_COUNT))} words."
        )
        if (selected_category or "").strip():
            user_prompt += f'\nSelected category: "{selected_category.strip()}". Write for this category only. Do not switch to another category.'

    avoid_block = ""
    if avoid_titles:
        avoid_block = "\nDo NOT reuse or closely mimic these existing titles:\n" + "\n".join(avoid_titles[:BLOG_AVOID_TITLE_LIMIT])

    category_list = ", ".join(categories) if categories else "General, Updates, Insights"
    internal_links_block = _build_internal_links_catalog(posts_for_links, exclude_post_id)
    internal_links_requirement = ""
    if internal_links_block:
        internal_links_requirement = (
            "- Include at least 2 natural in-body internal links to related posts using "
            '<a href="/blog/posts/{post-id}">descriptive anchor text</a> with the exact paths from the catalog.\n'
        )
    target_words = max(800, min(word_count, BLOG_MAX_WORD_COUNT))

    prompt = with_json_contract(
        (
            f"{style_context}\n"
            f"{internal_links_block}\n"
            f"{product_destinations_block(brand)}\n"
            f"{official_sources_block()}\n"
            f"{avoid_block}\n\n"
            f"{user_prompt}\n\n"
            f"{metadata_requirements(brand=brand, category_list=category_list, required_category=selected_category or '')}\n"
        ),
        schema_hint={
            "type": "object",
            "required": ["title", "category", "metaDescription", "keywords", "imagePrompt"],
            "properties": {
                "title": {"type": "string"},
                "category": {"type": "string"},
                "metaDescription": {"type": "string"},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "imagePrompt": {"type": "string"},
            },
        },
    )

    result = ai_service.retry_request(
        prompt=prompt,
        preferred_model=preferred_model,
        task_type=BLOG_TASK_TYPE,
        response_format={"type": "json_object"},
        prefer_groq_first=True,
        prefer_gemini=True,
        max_tokens=BLOG_METADATA_MAX_TOKENS,
        context={"category": selected_category or "", "title": (title or "").strip(), "mode": mode},
    )

    try:
        payload = _parse_ai_json_payload(result.text, context="Blog generation")
    except AIServiceError as exc:
        raise AIServiceError("Blog generation response was not valid JSON") from exc

    generated_title = str(payload.get("title") or (title or topic or "")).strip()
    if not generated_title:
        raise AIServiceError("Blog generation returned an empty title")

    duplicate = _duplicate_title(generated_title, existing_posts, exclude_post_id)
    if duplicate:
        raise AIServiceError(f"A blog with a similar title already exists: \"{duplicate}\"")

    content_html = str(payload.get("contentHtml") or "").strip()
    if not content_html:
        content_html = _extract_json_string_field(result.text, "contentHtml").strip()

    keywords = _normalize_keywords(payload.get("keywords"))
    meta_description = _clamp_meta_description(
        str(payload.get("metaDescription") or "").strip(),
        keywords[0] if keywords else "",
    )
    model_used = result.model_used

    if not content_html:
        logger.info("Blog metadata returned without body — generating article HTML in follow-up call")
        content_html, body_model = _generate_blog_body_html(
            generated_title=generated_title,
            meta_description=meta_description,
            keywords=keywords,
            user_prompt=user_prompt,
            website_name=website_name,
            style_context=style_context,
            internal_links_block=internal_links_block,
            internal_links_requirement=internal_links_requirement,
            preferred_model=preferred_model,
            target_words=target_words,
            selected_category=selected_category,
        )
        if body_model:
            model_used = body_model

    if not content_html:
        raise AIServiceError("Blog generation returned empty content")

    content_html = _ensure_internal_links(content_html, posts_for_links, exclude_post_id)

    required_category = (selected_category or "").strip()
    category_name = required_category or str(payload.get("category") or "").strip()
    if required_category:
        category_name = required_category
    elif categories and category_name and category_name not in categories:
        lowered = category_name.lower()
        match = next((c for c in categories if c.lower() == lowered), None)
        category_name = match or categories[0]
    elif not category_name and categories:
        category_name = categories[0]

    image_prompt = str(payload.get("imagePrompt") or "").strip()
    used_images = [
        str(p.get("image") or "").strip()
        for p in existing_posts
        if str(p.get("image") or "").strip()
        and (not exclude_post_id or str(p.get("id")) != exclude_post_id)
    ]
    image_url = resolve_featured_image_url(
        title=generated_title,
        keywords=keywords,
        image_prompt=image_prompt,
        category=category_name,
        used_image_urls=used_images,
    )

    return {
        "title": generated_title[:200],
        "author": author_name.strip()[:120],
        "metaDescription": meta_description[:200],
        "keywords": keywords,
        "contentHtml": content_html,
        "categoryName": category_name,
        "image": image_url,
        "imagePrompt": image_prompt,
        "modelUsed": model_used,
    }


def run_blog_generation(
    *,
    body: Any,
    user: dict[str, Any],
    db: Session,
    workspace_id: str,
) -> dict[str, Any]:
    ws = workspace_id
    enforce_ai_usage_limit(settings, user_id=str(user["id"]), category="content")

    mode = (body.mode or "full").strip().lower()
    if mode not in {"full", "title"}:
        raise HTTPException(status_code=400, detail="mode must be 'full' or 'title'")

    try:
        category_rows = list_categories(ws)
        categories = [str(c.get("name") or "").strip() for c in category_rows if str(c.get("name") or "").strip()]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load categories: {exc}") from exc

    try:
        post_rows = list_blog_summaries(ws)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load existing blogs: {exc}") from exc

    existing_posts = post_rows

    linkable_posts: list[dict[str, Any]] = []
    try:
        linkable_posts = list_linkable_blog_posts(ws, exclude_post_id=body.excludePostId)
    except Exception:
        linkable_posts = []

    website_name = ""
    try:
        settings_row = db.execute(
            text("select settings_json from flowpilot_blog_settings where workspace_id = :workspace_id"),
            {"workspace_id": ws},
        ).mappings().first()
        if settings_row:
            settings_data = json.loads(settings_row["settings_json"] or "{}")
            website_name = str(settings_data.get("general", {}).get("websiteName") or website_name)
    except Exception:
        pass

    author_name = str(getattr(body, "author", None) or "").strip()

    try:
        result = generate_blog_content(
            mode=mode,
            categories=categories,
            existing_posts=existing_posts,
            linkable_posts=linkable_posts,
            website_name=website_name,
            preferred_model=body.aiModel,
            topic=body.topic,
            industry=body.industry,
            audience=body.audience,
            tone=body.tone,
            word_count=body.wordCount,
            title=body.title,
            exclude_post_id=body.excludePostId,
            author_name=author_name,
            selected_category=str(getattr(body, "categoryName", None) or getattr(body, "category", None) or "").strip() or None,
        )
    except AIServiceError as exc:
        detail: Any = exc.public_payload if exc.public_payload else str(exc)
        status = exc.status_code if exc.status_code in (400, 401, 402, 408, 429, 503) else 503
        if exc.public_payload:
            status = 503
        raise HTTPException(status_code=status, detail=detail) from exc

    return {"success": True, "data": result}


def _strip_json_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def _parse_ai_json_payload(raw: str, *, context: str = "AI") -> dict[str, Any]:
    text = _strip_json_fences(raw)
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    if start < 0:
        raise AIServiceError(f"{context} response was not valid JSON")

    fragment = text[start:]
    for end in range(len(fragment), max(1, len(fragment) - 4000), -1):
        candidate = fragment[:end].rstrip()
        if not candidate:
            continue
        if candidate[-1] not in ('"', "}", "]", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"):
            continue
        open_braces = candidate.count("{") - candidate.count("}")
        open_brackets = candidate.count("[") - candidate.count("]")
        if open_braces < 0 or open_brackets < 0:
            continue
        candidate_closed = candidate + ("]" * open_brackets) + ("}" * open_braces)
        try:
            payload = json.loads(candidate_closed)
            if isinstance(payload, dict):
                logger.warning("%s JSON was truncated; recovered partial payload", context)
                return payload
        except json.JSONDecodeError:
            continue

    raise AIServiceError(f"{context} response was not valid JSON")


def _merge_content_additions(content_html: str, additions_html: str) -> str:
    additions = additions_html.strip()
    if not additions:
        return content_html
    faq_match = re.search(r"<h2[^>]*>\s*Frequently\s+Asked\s+Questions", content_html, re.IGNORECASE)
    if faq_match:
        return content_html[: faq_match.start()] + additions + content_html[faq_match.start() :]
    return content_html.rstrip() + additions


def _clamp_meta_description(meta: str, keyword: str = "") -> str:
    text = " ".join(meta.split())
    if 120 <= len(text) <= 160:
        return text

    if len(text) > 160:
        text = text[:157].rstrip()
        cut = text.rfind(" ")
        if cut > 110:
            text = text[:cut]
        if text and text[-1] not in ".!?":
            text = f"{text}."

    if len(text) < 120:
        suffix = (
            f" Discover practical {keyword} tips for better results."
            if keyword.strip()
            else " Learn practical steps you can apply today."
        )
        text = f"{text}{suffix}".strip()
        text = " ".join(text.split())

    if len(text) > 160:
        text = text[:157].rstrip()
        cut = text.rfind(" ")
        if cut > 110:
            text = text[:cut]
        if text and text[-1] not in ".!?":
            text = f"{text}."

    return text[:160]


def _format_failed_checks_for_prompt(failed_checks: list[dict[str, Any]], focus: str = "all") -> str:
    if not failed_checks:
        return "No specific issues provided."
    lines: list[str] = []
    for check in failed_checks[:20]:
        label = str(check.get("suggestionLabel") or check.get("label") or "").strip()
        message = str(check.get("message") or "").strip()
        category = str(check.get("category") or "").strip().upper()
        if not label:
            continue
        detail = f" — {message}" if message else ""
        lines.append(f"- [{category}] {label}{detail}")
    focus_note = ""
    if focus == "content":
        focus_note = (
            "Fix ALL content quality gaps first (FAQ, summary, takeaways, worked examples, "
            "official sources, tables, lists, definitions). Do not invent statistics or case studies.\n"
        )
    elif focus == "ai_visibility":
        focus_note = "Improve entity coverage, semantic keywords, trust signals, and citations.\n"
    elif focus == "seo":
        focus_note = "Fix technical SEO: keywords in title/permalink/meta, internal/external links, headings, alt text.\n"
    body = "\n".join(lines) if lines else "No specific issues provided."
    return f"{focus_note}{body}"


def optimize_blog_content(
    *,
    title: str,
    meta_description: str,
    keywords: list[str],
    content_html: str,
    permalink: str | None,
    author: str | None,
    failed_checks: list[dict[str, Any]],
    preferred_model: str | None,
    linkable_posts: list[dict[str, Any]],
    exclude_post_id: str | None,
    primary_keyword: str | None,
    focus: str = "all",
) -> dict[str, Any]:
    keyword = (primary_keyword or (keywords[0] if keywords else "")).strip()
    internal_links_block = _build_internal_links_catalog(linkable_posts, exclude_post_id)
    issues_block = _format_failed_checks_for_prompt(failed_checks, focus=focus)

    brand = brand_name(None)
    prompt = with_json_contract(
        (
            f"{optimize_requirements(brand=brand)}\n"
            f"{internal_links_block}\n"
            f"{product_destinations_block(brand)}\n"
            f"{official_sources_block()}\n\n"
            f"Primary keyword: {keyword or '(none)'}\n"
            f"Permalink slug: {(permalink or '').strip() or '(not set)'}\n"
            f"Author: {(author or '').strip() or '(not set)'}\n"
            f"Current title: {title.strip()}\n"
            f"Current meta description: {meta_description.strip()}\n"
            f"Current keywords: {', '.join(keywords)}\n\n"
            "Issues to fix:\n"
            f"{issues_block}\n\n"
            "Also return an improved title, metaDescription (120-160 chars), keywords, and permalink if needed.\n"
            "Do not keyword-stuff the title. Do not invent facts to chase a score.\n\n"
            "Existing article HTML (for context — do not repeat in additionsHtml):\n"
            f"{content_html.strip()[:12000]}\n"
        ),
        schema_hint={
            "type": "object",
            "required": ["title", "metaDescription", "keywords", "additionsHtml"],
            "properties": {
                "title": {"type": "string"},
                "metaDescription": {"type": "string"},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "additionsHtml": {"type": "string"},
                "permalink": {"type": "string"},
            },
        },
    )

    result = ai_service.retry_request(
        prompt=prompt,
        preferred_model=preferred_model,
        task_type=BLOG_TASK_TYPE,
        response_format={"type": "json_object"},
        prefer_groq_first=True,
        prefer_gemini=True,
        max_tokens=2048,
    )

    try:
        payload = _parse_ai_json_payload(result.text, context="Blog optimization")
    except AIServiceError as exc:
        raise AIServiceError("Blog optimization response was not valid JSON") from exc

    additions_html = str(payload.get("additionsHtml") or "").strip()
    full_html = str(payload.get("contentHtml") or "").strip()
    if full_html and len(full_html) > len(content_html) * 0.4:
        improved_html = full_html
    elif additions_html:
        improved_html = _merge_content_additions(content_html, additions_html)
    else:
        improved_html = content_html

    improved_html = _ensure_internal_links(improved_html, linkable_posts, exclude_post_id)

    improved_meta = str(payload.get("metaDescription") or meta_description).strip()
    improved_meta = _clamp_meta_description(improved_meta, keyword)

    return {
        "title": str(payload.get("title") or title).strip()[:200],
        "metaDescription": improved_meta,
        "keywords": _normalize_keywords(payload.get("keywords") or keywords),
        "contentHtml": improved_html,
        "permalink": str(payload.get("permalink") or permalink or "").strip()[:120],
        "modelUsed": result.model_used,
    }


def run_blog_optimization(
    *,
    body: Any,
    user: dict[str, Any],
    workspace_id: str,
) -> dict[str, Any]:
    ws = workspace_id
    # Post-generation polish runs automatically (up to several rounds per draft).
    # It shares the same AI providers as generate but should not consume the content quota.

    content_html = str(body.contentHtml or "").strip()
    if not content_html:
        raise HTTPException(status_code=400, detail="contentHtml is required")

    linkable_posts: list[dict[str, Any]] = []
    try:
        linkable_posts = list_linkable_blog_posts(ws, exclude_post_id=body.excludePostId)
    except Exception:
        linkable_posts = []

    failed_checks = [c.model_dump() if hasattr(c, "model_dump") else dict(c) for c in (body.failedChecks or [])]
    focus = str(getattr(body, "focus", None) or "all").strip().lower()

    try:
        result = optimize_blog_content(
            title=str(body.title or "").strip(),
            meta_description=str(body.metaDescription or "").strip(),
            keywords=list(body.keywords or []),
            content_html=content_html,
            permalink=str(body.permalink or "").strip() or None,
            author=str(body.author or "").strip() or None,
            failed_checks=failed_checks,
            preferred_model=body.aiModel,
            linkable_posts=linkable_posts,
            exclude_post_id=body.excludePostId,
            primary_keyword=str(body.primaryKeyword or "").strip() or None,
            focus=focus,
        )
    except AIServiceError as exc:
        status = exc.status_code if exc.status_code in (400, 401, 402, 408, 429) else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc

    return {"success": True, "data": result}
