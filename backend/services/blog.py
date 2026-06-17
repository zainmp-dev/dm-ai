"""Blog CMS — data access, AI generation, and featured-image resolution."""

from __future__ import annotations

import hashlib
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
    id, workspace_id, title, author, keywords, category_id,
    meta_description, content, featured_image_url, status,
    views, clicks, published_at, created_at, updated_at
"""

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100


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

    return {
        **payload,
        "title": title[:500],
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


def row_to_post(row: dict[str, Any], category_name: str = "") -> dict[str, Any]:
    keywords = row.get("keywords") or []
    content = row.get("content") or ""
    title = row.get("title") or ""
    return {
        "id": str(row["id"]),
        "title": title,
        "slug": _slugify(title),
        "author": row.get("author") or "",
        "content": content,
        "description": _plain_text(content)[:150],
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
        where = "where workspace_id = :ws"
        if status and status.lower() != "all":
            where += " and status = :status"
            params["status"] = status.lower()

        total = db.execute(
            text(f"select count(*)::int as cnt from flowpilot_blogs {where}"),
            params,
        ).mappings().first()
        total_blogs = int((total or {}).get("cnt") or 0)
        total_pages = max(1, (total_blogs + limit - 1) // limit) if total_blogs else 1

        query = f"""
            select {BLOG_LIST_COLUMNS}
            from flowpilot_blogs
            {where}
            order by updated_at desc
            limit :limit offset :offset
        """
        rows = db.execute(
            text(query),
            {**params, "limit": limit, "offset": offset},
        ).mappings().all()
        names = _category_name_map(db, workspace_id)
        blogs = [row_to_post(dict(r), names.get(str(r.get("category_id") or ""), "")) for r in rows]

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
                select b.id, b.title, b.featured_image_url, c.name as category_name
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
                "slug": _slugify(str(r.get("title") or "")),
                "category_name": r.get("category_name") or "",
                "image": r.get("featured_image_url") or "",
            }
            for r in rows
        ]


def get_blog(workspace_id: str, blog_id: str) -> dict[str, Any] | None:
    with _session() as db:
        row = db.execute(
            text(
                f"""
                select {BLOG_LIST_COLUMNS}
                from flowpilot_blogs
                where workspace_id = :ws and id = :id
                """
            ),
            {"ws": workspace_id, "id": blog_id},
        ).mappings().first()
        if not row:
            return None
        category_name = ""
        if row.get("category_id"):
            cat = db.execute(
                text("select name from flowpilot_categories where id = :id and workspace_id = :ws"),
                {"id": str(row["category_id"]), "ws": workspace_id},
            ).mappings().first()
            if cat:
                category_name = str(cat.get("name") or "")
        return row_to_post(dict(row), category_name)


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
                    id, workspace_id, title, author, keywords, category_id,
                    meta_description, content, featured_image_url, status,
                    published_at, created_at, updated_at
                ) values (
                    :id, :ws, :title, :author, :keywords, :category_id,
                    :meta_description, :content, :featured_image_url, :status,
                    :published_at, :created_at, :updated_at
                )
                """
            ),
            {
                "id": blog_id,
                "ws": workspace_id,
                "title": payload["title"],
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
        return "No published posts yet — use a clear, professional blog style."
    titles = [str(p.get("title") or "").strip() for p in posts if str(p.get("title") or "").strip()]
    categories = [str(p.get("category_name") or "").strip() for p in posts if str(p.get("category_name") or "").strip()]
    top_categories = list(dict.fromkeys(categories))[:5]
    return (
        f"Existing blog titles for tone reference: {', '.join(titles[:8]) or 'n/a'}.\n"
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


def generate_blog_content(
    *,
    mode: str,
    categories: list[str],
    existing_posts: list[dict[str, Any]],
    website_name: str,
    preferred_model: str | None,
    topic: str | None = None,
    industry: str | None = None,
    audience: str | None = None,
    tone: str | None = None,
    word_count: int = 800,
    title: str | None = None,
    exclude_post_id: str | None = None,
) -> dict[str, Any]:
    style_context = _build_style_context(existing_posts)
    avoid_titles = [
        str(p.get("title") or "").strip()
        for p in existing_posts
        if str(p.get("title") or "").strip() and (not exclude_post_id or str(p.get("id")) != exclude_post_id)
    ]

    if mode == "title":
        if not (title or "").strip():
            raise AIServiceError("Title is required for title-based generation")
        user_prompt = (
            f"Generate a complete blog post based on this title: \"{title.strip()}\".\n"
            "Expand it into a full, publish-ready article."
        )
    else:
        if not (topic or "").strip():
            raise AIServiceError("Topic is required")
        user_prompt = (
            f"Topic: {topic.strip()}\n"
            f"Industry: {(industry or 'Business').strip()}\n"
            f"Audience: {(audience or 'Professionals and decision-makers').strip()}\n"
            f"Tone: {(tone or 'Professional').strip()}\n"
            f"Target length: ~{max(400, min(word_count, 2000))} words."
        )

    avoid_block = ""
    if avoid_titles:
        avoid_block = "\nDo NOT reuse or closely mimic these existing titles:\n" + "\n".join(avoid_titles[:20])

    category_list = ", ".join(categories) if categories else "General, Updates, Insights"

    prompt = with_json_contract(
        (
            f"You are an expert content writer for {website_name or 'our company'}.\n"
            "Write professional, SEO-friendly, educational blog content.\n"
            f"{style_context}\n"
            f"Available categories (pick exactly one name from this list): {category_list}\n"
            f"{avoid_block}\n\n"
            f"{user_prompt}\n\n"
            "Requirements:\n"
            "- Use semantic HTML only (p, h2, h3, ul, li, strong, em). No markdown.\n"
            "- Include an introduction, 3-5 main sections, a FAQ section titled 'Frequently Asked Questions', and a short CTA paragraph.\n"
            "- metaDescription must be 120-160 characters.\n"
            "- keywords: 5-8 relevant phrases.\n"
            "- author: a realistic byline name suited to the article (e.g. team member or brand voice).\n"
            "- imagePrompt: one detailed sentence describing a professional featured banner image that visually matches this article (people, setting, objects, mood). No text or logos in the image.\n"
            "- imagePrompt must be visually distinct from generic stock photos — specify unique subjects, composition, lighting, or setting.\n"
        ),
        schema_hint={
            "type": "object",
            "required": ["title", "author", "category", "metaDescription", "keywords", "contentHtml", "imagePrompt"],
            "properties": {
                "title": {"type": "string"},
                "author": {"type": "string"},
                "category": {"type": "string"},
                "metaDescription": {"type": "string"},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "contentHtml": {"type": "string"},
                "imagePrompt": {"type": "string"},
            },
        },
    )

    result = ai_service.retry_request(
        prompt=prompt,
        preferred_model=preferred_model,
        task_type="carousel",
        response_format={"type": "json_object"},
        prefer_groq_first=True,
        prefer_gemini=True,
        max_tokens=8192,
    )

    try:
        payload = json.loads(result.text)
    except json.JSONDecodeError as exc:
        raise AIServiceError("Blog generation response was not valid JSON") from exc

    generated_title = str(payload.get("title") or (title or topic or "")).strip()
    if not generated_title:
        raise AIServiceError("Blog generation returned an empty title")

    duplicate = _duplicate_title(generated_title, existing_posts, exclude_post_id)
    if duplicate:
        raise AIServiceError(f"A blog with a similar title already exists: \"{duplicate}\"")

    content_html = str(payload.get("contentHtml") or "").strip()
    if not content_html:
        raise AIServiceError("Blog generation returned empty content")

    category_name = str(payload.get("category") or "").strip()
    if categories and category_name and category_name not in categories:
        lowered = category_name.lower()
        match = next((c for c in categories if c.lower() == lowered), None)
        category_name = match or categories[0]
    elif not category_name and categories:
        category_name = categories[0]

    keywords = _normalize_keywords(payload.get("keywords"))
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
        "author": str(payload.get("author") or "").strip()[:120],
        "metaDescription": str(payload.get("metaDescription") or "").strip()[:200],
        "keywords": keywords,
        "contentHtml": content_html,
        "categoryName": category_name,
        "image": image_url,
        "imagePrompt": image_prompt,
        "modelUsed": result.model_used,
    }


def run_blog_generation(
    *,
    body: Any,
    user: dict[str, Any],
    db: Session,
) -> dict[str, Any]:
    ws = _workspace_id(user)
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

    try:
        result = generate_blog_content(
            mode=mode,
            categories=categories,
            existing_posts=existing_posts,
            website_name=website_name,
            preferred_model=body.aiModel,
            topic=body.topic,
            industry=body.industry,
            audience=body.audience,
            tone=body.tone,
            word_count=body.wordCount,
            title=body.title,
            exclude_post_id=body.excludePostId,
        )
    except AIServiceError as exc:
        status = exc.status_code if exc.status_code in (400, 401, 402, 408, 429) else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc

    return {"success": True, "data": result}
