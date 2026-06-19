"""Blog API — dashboard, clicks, settings, and CMS CRUD."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from services import blog as blog_svc
from utils.admin_rbac import normalize_stored_role
from utils.workspace_scope import tenant_workspace_dependency

router = APIRouter(prefix="/blog", tags=["blog"])
api_router = APIRouter(prefix="/api", tags=["blog-cms"])

DEFAULT_SETTINGS = {
    "general": {
        "websiteName": "",
        "websiteUrl": "",
        "logoUrl": "",
        "faviconUrl": "",
    },
    "content": {
        "defaultAuthor": "",
        "defaultCategory": "",
    },
    "appearance": {
        "primaryColor": "#4f46e5",
        "secondaryColor": "#111827",
    },
}


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    if not token.startswith("flowpilot-"):
        raise HTTPException(status_code=401, detail="Invalid auth token")
    user_id = token.removeprefix("flowpilot-").rsplit("-", 1)[0]
    row = db.execute(
        text("select id, name, email, role from flowpilot_users where id = :id and deleted_at is null"),
        {"id": user_id},
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    user = dict(row)
    user["role"] = normalize_stored_role(user.get("role"))
    return user


def _tenant_workspace(
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_flowpilot_workspace_setup_id: str | None = Header(default=None, alias="X-Flowpilot-Workspace-Setup-Id"),
    x_flowpilot_workspace_company_name: str | None = Header(default=None, alias="X-Flowpilot-Workspace-Company-Name"),
    x_flowpilot_workspace_website: str | None = Header(default=None, alias="X-Flowpilot-Workspace-Website"),
) -> str:
    return tenant_workspace_dependency(
        user,
        db,
        x_flowpilot_workspace_setup_id,
        x_flowpilot_workspace_company_name,
        x_flowpilot_workspace_website,
    )


def _normalize_status(status: str) -> str:
    s = (status or "draft").lower().strip()
    if s not in blog_svc.BLOG_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    return s


# ---------------------------------------------------------------------------
# UI routes (/blog/*)
# ---------------------------------------------------------------------------


@router.get("/dashboard")
def blog_dashboard(
    workspace_id: str = Depends(_tenant_workspace),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ws = workspace_id
    rows = db.execute(
        text(
            """
            select b.id, b.title, b.author, b.status, b.views, b.clicks,
                   b.featured_image_url as image, c.name as category_name,
                   b.created_at, b.updated_at, b.published_at
            from flowpilot_blogs b
            left join flowpilot_categories c on c.id = b.category_id
            where b.workspace_id = :workspace_id
            order by b.updated_at desc
            """
        ),
        {"workspace_id": ws},
    ).mappings().all()

    counts = {s: 0 for s in blog_svc.BLOG_STATUSES}
    for row in rows:
        status = str(row.get("status") or "draft")
        if status in counts:
            counts[status] += 1

    total_clicks = sum(int(row.get("clicks") or 0) for row in rows)

    recent = [
        {
            "id": str(r["id"]),
            "title": r.get("title") or "",
            "author": r.get("author") or "",
            "status": r.get("status") or "draft",
            "views": int(r.get("views") or 0),
            "image": r.get("image") or "",
            "categoryName": r.get("category_name") or "",
            "updatedAt": r["updated_at"].isoformat() if r.get("updated_at") else None,
        }
        for r in rows[:8]
    ]

    return {
        "success": True,
        "data": {
            "stats": {
                "totalBlogs": len(rows),
                "publishedBlogs": counts["published"],
                "draftBlogs": counts["draft"],
                "scheduledBlogs": counts["scheduled"],
                "archivedBlogs": counts["archived"],
                "totalClicks": total_clicks,
            },
            "recentPosts": recent,
        },
    }


@router.get("/clicks")
def blog_clicks(
    workspace_id: str = Depends(_tenant_workspace),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ws = workspace_id
    rows = db.execute(
        text(
            """
            select b.id, b.title, b.status, b.clicks, c.name as category_name,
                   b.published_at, b.updated_at
            from flowpilot_blogs b
            left join flowpilot_categories c on c.id = b.category_id
            where b.workspace_id = :workspace_id
            order by b.clicks desc, b.updated_at desc
            """
        ),
        {"workspace_id": ws},
    ).mappings().all()

    blogs = [
        {
            "id": str(r["id"]),
            "title": r.get("title") or "",
            "status": r.get("status") or "draft",
            "clicks": int(r.get("clicks") or 0),
            "categoryName": r.get("category_name") or "",
            "publishedAt": r["published_at"].isoformat() if r.get("published_at") else None,
        }
        for r in rows
    ]

    return {
        "success": True,
        "data": {
            "totalClicks": sum(b["clicks"] for b in blogs),
            "blogs": blogs,
        },
    }


@router.get("/settings")
def get_settings(
    workspace_id: str = Depends(_tenant_workspace),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ws = workspace_id
    row = db.execute(
        text("select settings_json from flowpilot_blog_settings where workspace_id = :workspace_id"),
        {"workspace_id": ws},
    ).mappings().first()
    if not row:
        return {"success": True, "data": DEFAULT_SETTINGS}
    try:
        data = json.loads(row["settings_json"] or "{}")
    except json.JSONDecodeError:
        data = {}
    merged = {
        "general": {**DEFAULT_SETTINGS["general"], **data.get("general", {})},
        "content": {**DEFAULT_SETTINGS["content"], **data.get("content", {})},
        "appearance": {**DEFAULT_SETTINGS["appearance"], **data.get("appearance", {})},
    }
    return {"success": True, "data": merged}


# ---------------------------------------------------------------------------
# CMS routes (/api/*)
# ---------------------------------------------------------------------------


class BlogInput(BaseModel):
    title: str = Field(min_length=1)
    slug: str = ""
    author: str = ""
    keywords: list[str] = Field(default_factory=list)
    categoryId: str | None = None
    metaDescription: str = ""
    content: str = ""
    featuredImageUrl: str = ""
    status: str = "draft"
    image: str | None = None
    tags: list[str] | None = None
    category_id: str | None = None
    meta_description: str | None = None
    featured_image_url: str | None = None


class CategoryInput(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""


class BlogGenerateInput(BaseModel):
    mode: str = "full"
    aiModel: str | None = None
    topic: str | None = None
    industry: str | None = None
    audience: str | None = None
    tone: str | None = None
    wordCount: int = Field(default_factory=lambda: blog_svc.BLOG_DEFAULT_WORD_COUNT)
    title: str | None = None
    excludePostId: str | None = None
    author: str | None = None


class FailedCheckInput(BaseModel):
    id: str
    label: str
    message: str = ""
    suggestionLabel: str = ""
    category: str = ""
    weight: int = 0


class BlogOptimizeInput(BaseModel):
    title: str = ""
    metaDescription: str = ""
    keywords: list[str] = Field(default_factory=list)
    contentHtml: str = Field(min_length=1)
    permalink: str | None = None
    author: str | None = None
    failedChecks: list[FailedCheckInput] = Field(default_factory=list)
    aiModel: str | None = None
    excludePostId: str | None = None
    primaryKeyword: str | None = None
    focus: str = "all"


def _blog_payload(body: BlogInput, user: dict[str, Any]) -> dict[str, Any]:
    keywords = body.keywords or body.tags or []
    category_id = body.categoryId or body.category_id
    return {
        "title": body.title,
        "slug": body.slug,
        "author": body.author.strip() or str(user.get("name") or "Admin"),
        "keywords": keywords,
        "category_id": category_id or None,
        "meta_description": body.metaDescription or body.meta_description or "",
        "content": body.content,
        "featured_image_url": body.featuredImageUrl or body.featured_image_url or body.image or "",
        "status": (body.status or "draft").lower(),
    }


@api_router.get("/blogs")
def list_blogs(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    data = blog_svc.list_blogs(ws, status=status, page=page, limit=limit)
    return {"success": True, "data": data}


@api_router.get("/blogs/{blog_id}")
def get_blog(
    blog_id: str,
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    row = blog_svc.get_blog(ws, blog_id)
    if not row:
        raise HTTPException(status_code=404, detail="Blog not found")
    return {"success": True, "data": row}


@api_router.post("/blogs")
def create_blog(
    body: BlogInput,
    user: dict[str, Any] = Depends(get_current_user),
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    payload = _blog_payload(body, user)
    payload["status"] = _normalize_status(payload["status"])
    created = blog_svc.create_blog(ws, payload)
    return {"success": True, "data": created, "message": "Blog created"}


@api_router.put("/blogs/{blog_id}")
def update_blog(
    blog_id: str,
    body: BlogInput,
    user: dict[str, Any] = Depends(get_current_user),
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    payload = _blog_payload(body, user)
    payload["status"] = _normalize_status(payload["status"])
    updated = blog_svc.update_blog(ws, blog_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Blog not found")
    return {"success": True, "data": updated, "message": "Blog updated"}


@api_router.delete("/blogs/{blog_id}")
def delete_blog(
    blog_id: str,
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    if not blog_svc.delete_blog(ws, blog_id):
        raise HTTPException(status_code=404, detail="Blog not found")
    return {"success": True, "message": "Blog deleted"}


@api_router.post("/blogs/upload-image")
async def upload_blog_image(
    file: UploadFile = File(...),
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    data = await file.read()
    url = blog_svc.upload_featured_image(ws, data, file.filename or "image.jpg", file.content_type or "")
    return {"success": True, "data": {"url": url, "featuredImageUrl": url}, "message": "Image uploaded"}


@api_router.get("/categories")
def list_categories(
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    return {"success": True, "data": blog_svc.list_categories(ws)}


@api_router.post("/categories")
def create_category(
    body: CategoryInput,
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    cat_id = blog_svc.create_category(ws, body.name, body.description)
    return {"success": True, "data": {"id": cat_id}, "message": "Category created"}


@api_router.put("/categories/{category_id}")
def update_category(
    category_id: str,
    body: CategoryInput,
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    if not blog_svc.update_category(ws, category_id, body.name, body.description):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"success": True, "message": "Category updated"}


@api_router.delete("/categories/{category_id}")
def delete_category(
    category_id: str,
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    ws = workspace_id
    if not blog_svc.delete_category(ws, category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"success": True, "message": "Category deleted"}


@api_router.post("/blogs/generate")
def api_generate_blog(
    body: BlogGenerateInput,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    return blog_svc.run_blog_generation(body=body, user=user, db=db, workspace_id=workspace_id)


@api_router.post("/blogs/optimize")
def api_optimize_blog(
    body: BlogOptimizeInput,
    user: dict[str, Any] = Depends(get_current_user),
    workspace_id: str = Depends(_tenant_workspace),
) -> dict[str, Any]:
    return blog_svc.run_blog_optimization(body=body, user=user, workspace_id=workspace_id)
