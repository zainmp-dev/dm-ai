"""Resolve tenant workspace scope from auth user + client setup id."""

from __future__ import annotations

import re
from typing import Any

from fastapi import Header
from sqlalchemy import text
from sqlalchemy.orm import Session

WORKSPACE_SETUP_ID_HEADER = "X-Flowpilot-Workspace-Setup-Id"
WORKSPACE_COMPANY_HEADER = "X-Flowpilot-Workspace-Company-Name"
WORKSPACE_WEBSITE_HEADER = "X-Flowpilot-Workspace-Website"

_SETUP_ID_RE = re.compile(r"^ws-local-\d+$")


def resolve_workspace_scope_id(user: dict[str, Any], setup_id: str | None) -> str:
    """Map auth user + optional client setup id to the blog/data workspace key."""
    user_id = str(user["id"])
    raw = (setup_id or "").strip()
    if not raw or raw == user_id:
        return user_id
    if not _SETUP_ID_RE.match(raw):
        return user_id
    return raw


def ensure_workspace_exists(
    db: Session,
    workspace_id: str,
    *,
    company_name: str = "",
    company_website: str = "",
    workspace_scenario: str = "b2b-saas",
    primary_region: str = "uae-india",
) -> None:
    """Insert a flowpilot_workspace row for client setup ids (FK for blogs/categories)."""
    db.execute(
        text(
            """
            insert into flowpilot_workspace (
                workspace_id, company_name, company_website, workspace_scenario,
                primary_region, workspace_configured, updated_at
            ) values (
                :workspace_id, :company_name, :company_website, :workspace_scenario,
                :primary_region, true, now()
            )
            on conflict (workspace_id) do update set
                company_name = coalesce(nullif(excluded.company_name, ''), flowpilot_workspace.company_name),
                company_website = coalesce(nullif(excluded.company_website, ''), flowpilot_workspace.company_website),
                updated_at = now()
            """
        ),
        {
            "workspace_id": workspace_id,
            "company_name": company_name.strip(),
            "company_website": company_website.strip(),
            "workspace_scenario": workspace_scenario,
            "primary_region": primary_region,
        },
    )


def resolve_tenant_workspace(
    user: dict[str, Any],
    db: Session,
    *,
    setup_id: str | None = None,
    company_name: str | None = None,
    company_website: str | None = None,
) -> str:
    workspace_id = resolve_workspace_scope_id(user, setup_id)
    if workspace_id != str(user["id"]):
        ensure_workspace_exists(
            db,
            workspace_id,
            company_name=company_name or "",
            company_website=company_website or "",
        )
        db.commit()
    return workspace_id


def tenant_workspace_dependency(
    user: dict[str, Any],
    db: Session,
    x_flowpilot_workspace_setup_id: str | None = Header(default=None, alias=WORKSPACE_SETUP_ID_HEADER),
    x_flowpilot_workspace_company_name: str | None = Header(default=None, alias=WORKSPACE_COMPANY_HEADER),
    x_flowpilot_workspace_website: str | None = Header(default=None, alias=WORKSPACE_WEBSITE_HEADER),
) -> str:
    return resolve_tenant_workspace(
        user,
        db,
        setup_id=x_flowpilot_workspace_setup_id,
        company_name=x_flowpilot_workspace_company_name,
        company_website=x_flowpilot_workspace_website,
    )
