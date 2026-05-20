"""Enterprise admin control-plane endpoints (RBAC-guarded).

Mounted from main so shared auth dependencies stay centralized."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from services.admin_audit_service import fetch_audit_page
from utils.admin_rbac import (
    ALL_PERMISSIONS,
    ASSIGNABLE_PLATFORM_ROLES,
    normalize_stored_role,
    permissions_for_role,
    role_display_name,
    role_has_permission,
    PERM_AI_OPS,
    PERM_AUDIT_EXPORT,
    PERM_AUDIT_READ,
    PERM_DB_EXPORT,
    PERM_DB_READ,
    PERM_OPS,
    PERM_SECURITY,
)
from utils.ai_usage_limits import public_rate_limits
from utils.rate_limit import check_rate_limit

logger = logging.getLogger(__name__)


def _secret_tail(raw: str | None) -> str | None:
    t = (raw or "").strip()
    if not t:
        return None
    return ("…" + t[-4:]) if len(t) > 4 else "…****"

_SAFE_EXTRA_TABLES = frozenset(
    {
        "content",
        "notification_state",
        "social_accounts",
        "posts",
        "post_targets",
        "ads_campaigns",
        "post_versions",
        "optimization_proposals",
        "campaign_analytics_snapshots",
        "integration_jobs",
    }
)

_IDENT_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def _extras_sql() -> str:
    return ", ".join(f"'{t}'" for t in sorted(_SAFE_EXTRA_TABLES))


def _readable_tables(db: Session) -> list[str]:
    extras = _extras_sql()
    rows = db.execute(
        text(
            f"""
            select table_name
            from information_schema.tables
            where table_schema = 'public'
              and table_type = 'BASE TABLE'
              and (
                table_name like 'flowpilot\\_%' escape '\\'
                or table_name in ({extras})
              )
            order by table_name
            """
        ),
    ).fetchall()
    return [str(r[0]) for r in rows]


def _quote_ident(name: str) -> str:
    if not _IDENT_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid table name")
    return '"' + name.replace('"', '""') + '"'


def _admin_throttle(request: Request, user_id: str) -> None:
    host = (request.client.host if request.client else "") or "unknown"
    key = f"admin_api:{user_id}:{host}"
    if not check_rate_limit(key, max_requests=400, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many admin requests")


def create_admin_control_router(*, require_admin: Callable[..., dict[str, Any]]) -> APIRouter:
    router = APIRouter(tags=["admin-control"])

    class PlatformSessionResponse(BaseModel):
        user_id: str
        email: str
        role: str
        role_label: str
        permissions: list[str]

    @router.get("/admin/platform/session", response_model=PlatformSessionResponse)
    def platform_session(admin: dict[str, Any] = Depends(require_admin)) -> PlatformSessionResponse:
        role = normalize_stored_role(str(admin.get("role")))
        perms = sorted(permissions_for_role(role))
        return PlatformSessionResponse(
            user_id=str(admin.get("id") or ""),
            email=str(admin.get("email") or ""),
            role=role,
            role_label=role_display_name(role),
            permissions=perms,
        )

    class RegistryRoleRow(BaseModel):
        role_id: str
        label: str
        assignable: bool

    class PermissionMatrixResponse(BaseModel):
        roles: list[RegistryRoleRow]
        permissions: list[str]

    @router.get("/admin/platform/rbac-matrix", response_model=PermissionMatrixResponse)
    def rbac_matrix(admin: dict[str, Any] = Depends(require_admin)) -> PermissionMatrixResponse:
        if not role_has_permission(str(admin.get("role")), PERM_SECURITY):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        roles = [
            RegistryRoleRow(role_id=r, label=role_display_name(r), assignable=r in ASSIGNABLE_PLATFORM_ROLES)
            for r in (
                "super_admin",
                "platform_admin",
                "workspace_admin",
                "moderator",
                "support_agent",
                "analyst",
                "admin",
                "user",
            )
        ]
        return PermissionMatrixResponse(roles=roles, permissions=sorted(ALL_PERMISSIONS))

    class DbOverviewResponse(BaseModel):
        ok: bool
        postgres_version: str | None = None
        database_bytes: int | None = None
        active_connections: int | None = None
        notes: list[str] = Field(default_factory=list)

    @router.get("/admin/db/overview", response_model=DbOverviewResponse)
    def db_overview(
        request: Request,
        admin: dict[str, Any] = Depends(require_admin),
        db: Session = Depends(get_db),
    ) -> DbOverviewResponse:
        _admin_throttle(request, str(admin.get("id") or ""))
        if not role_has_permission(str(admin.get("role")), PERM_DB_READ):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        notes: list[str] = []
        ver: str | None = None
        dbsize: int | None = None
        conns: int | None = None
        try:
            ver_row = db.execute(text("select version() as v")).mappings().first()
            if ver_row:
                ver = str(ver_row["v"])[:240]
        except SQLAlchemyError as exc:
            logger.warning("admin db overview version: %s", exc)
            notes.append("Unable to read PostgreSQL version (permissions or connectivity).")
        try:
            sz_row = db.execute(text("select pg_database_size(current_database())::bigint as b")).mappings().first()
            if sz_row:
                dbsize = int(sz_row["b"] or 0)
        except SQLAlchemyError as exc:
            logger.warning("admin db overview size: %s", exc)
            notes.append("Unable to read database size — grant usage or use Supabase metrics.")
        try:
            ac_row = db.execute(
                text("select count(*)::int as n from pg_stat_activity where datname = current_database()")
            ).mappings().first()
            if ac_row:
                conns = int(ac_row["n"] or 0)
        except SQLAlchemyError as exc:
            logger.warning("admin db overview activity: %s", exc)
            notes.append("Unable to read pg_stat_activity — optional for observability tier.")

        return DbOverviewResponse(
            ok=True,
            postgres_version=ver,
            database_bytes=dbsize,
            active_connections=conns,
            notes=notes,
        )

    class TableMetricRow(BaseModel):
        schema_name: str = "public"
        table_name: str
        row_estimate: int | None = None
        total_bytes: int | None = None

    class DbTablesResponse(BaseModel):
        tables: list[TableMetricRow]

    @router.get("/admin/db/tables", response_model=DbTablesResponse)
    def db_tables(
        request: Request,
        admin: dict[str, Any] = Depends(require_admin),
        db: Session = Depends(get_db),
    ) -> DbTablesResponse:
        _admin_throttle(request, str(admin.get("id") or ""))
        if not role_has_permission(str(admin.get("role")), PERM_DB_READ):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        allowed = set(_readable_tables(db))
        metrics: dict[str, tuple[int | None, int | None]] = {}
        try:
            stat_rows = db.execute(
                text(
                    """
                    select relname as t,
                           coalesce(reltuples::bigint, 0) as est,
                           pg_total_relation_size(relid)::bigint as sz
                    from pg_catalog.pg_stat_user_tables
                    where schemaname = 'public'
                    """
                )
            ).mappings().all()
            for r in stat_rows:
                metrics[str(r["t"])] = (int(r["est"]) if r["est"] is not None else None, int(r["sz"]) if r["sz"] is not None else None)
        except SQLAlchemyError:
            pass

        out: list[TableMetricRow] = []
        for name in sorted(allowed):
            est, sz = metrics.get(name, (None, None))
            out.append(TableMetricRow(table_name=name, row_estimate=est, total_bytes=sz))
        return DbTablesResponse(tables=out)

    class TableRowsResponse(BaseModel):
        columns: list[str]
        rows: list[dict[str, Any]]
        page: int
        page_size: int
        total: int

    @router.get("/admin/db/tables/{table_name}/rows", response_model=TableRowsResponse)
    def db_table_rows(
        table_name: str,
        request: Request,
        admin: dict[str, Any] = Depends(require_admin),
        db: Session = Depends(get_db),
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=100),
        q: str = Query("", max_length=220),
    ) -> TableRowsResponse:
        _admin_throttle(request, str(admin.get("id") or ""))
        if not role_has_permission(str(admin.get("role")), PERM_DB_READ):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        allowed = set(_readable_tables(db))
        if table_name not in allowed:
            raise HTTPException(status_code=404, detail="Unknown or restricted table")

        col_rows = db.execute(
            text(
                """
                select column_name
                from information_schema.columns
                where table_schema = 'public' and table_name = :t
                order by ordinal_position
                """
            ),
            {"t": table_name},
        ).fetchall()
        columns = [str(r[0]) for r in col_rows]
        if not columns:
            raise HTTPException(status_code=404, detail="Table has no readable columns")

        t_ident = _quote_ident(table_name)
        where_sql = "TRUE"
        params: dict[str, Any] = {"limit": page_size, "offset": (page - 1) * page_size}
        q_plain = q.strip()[:220].lower()
        if q_plain:
            ors: list[str] = []
            for i, c in enumerate(columns):
                pname = f"c{i}"
                params[pname] = f"%{q_plain}%"
                ors.append(f"cast({_quote_ident(c)} as text) ilike :{pname}")
            where_sql = "(" + " OR ".join(ors) + ")"

        filter_params = {k: v for k, v in params.items() if k not in {"limit", "offset"}}
        count_row = db.execute(
            text(f"select count(*)::int as n from public.{t_ident} where {where_sql}"),
            filter_params,
        ).mappings().first()
        total = int(count_row["n"] or 0) if count_row is not None else 0

        ordered_cols = ", ".join(f"public.{t_ident}.{_quote_ident(c)}" for c in columns)
        data_rows = db.execute(
            text(f"select {ordered_cols} from public.{t_ident} where {where_sql} limit :limit offset :offset"),
            params,
        ).mappings().all()
        serializable: list[dict[str, Any]] = []
        for row in data_rows:
            item: dict[str, Any] = {}
            for k, v in dict(row).items():
                if hasattr(v, "isoformat"):
                    item[str(k)] = v.isoformat()
                else:
                    item[str(k)] = v
            serializable.append(item)

        return TableRowsResponse(columns=columns, rows=serializable, page=page, page_size=page_size, total=total)

    class AuditEventRow(BaseModel):
        id: int
        actor_id: str
        actor_email: str | None
        action: str
        resource_type: str
        resource_id: str | None
        meta: dict[str, Any]
        ip: str | None
        created_at: Any

    class AuditPageResponse(BaseModel):
        items: list[AuditEventRow]
        total: int
        page: int
        page_size: int
        total_pages: int

    @router.get("/admin/audit/events", response_model=AuditPageResponse)
    def audit_events(
        request: Request,
        admin: dict[str, Any] = Depends(require_admin),
        db: Session = Depends(get_db),
        page: int = Query(1, ge=1),
        page_size: int = Query(40, ge=1, le=200),
        q: str = Query("", max_length=220),
    ) -> AuditPageResponse:
        _admin_throttle(request, str(admin.get("id") or ""))
        if not role_has_permission(str(admin.get("role")), PERM_AUDIT_READ):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        items_raw, total = fetch_audit_page(db, page=page, page_size=page_size, q=q)
        total_pages = (total + page_size - 1) // page_size if total else 0
        items = [
            AuditEventRow(
                id=int(r["id"]),
                actor_id=str(r.get("actor_id") or ""),
                actor_email=str(r["actor_email"]) if r.get("actor_email") else None,
                action=str(r.get("action") or ""),
                resource_type=str(r.get("resource_type") or ""),
                resource_id=str(r["resource_id"]) if r.get("resource_id") else None,
                meta=dict(r.get("meta") or {}),
                ip=str(r["ip"]) if r.get("ip") else None,
                created_at=r.get("created_at"),
            )
            for r in items_raw
        ]
        return AuditPageResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)

    class OpsOverviewResponse(BaseModel):
        integration_jobs_pending: int | None = None
        integration_jobs_failed: int | None = None
        notes: list[str] = Field(default_factory=list)

    @router.get("/admin/ops/overview", response_model=OpsOverviewResponse)
    def ops_overview(
        request: Request,
        admin: dict[str, Any] = Depends(require_admin),
        db: Session = Depends(get_db),
    ) -> OpsOverviewResponse:
        _admin_throttle(request, str(admin.get("id") or ""))
        if not role_has_permission(str(admin.get("role")), PERM_OPS):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        notes: list[str] = []
        pending = failed = None
        try:
            pr = db.execute(
                text(
                    """
                    select
                      sum(case when status = 'pending' then 1 else 0 end)::int as p,
                      sum(case when status = 'failed' then 1 else 0 end)::int as f
                    from integration_jobs
                    """
                )
            ).mappings().first()
            if pr:
                pending = int(pr["p"] or 0)
                failed = int(pr["f"] or 0)
        except SQLAlchemyError:
            notes.append("integration_jobs unreadable — schema may differ.")
        return OpsOverviewResponse(integration_jobs_pending=pending, integration_jobs_failed=failed, notes=notes)

    class AiProviderKeyRow(BaseModel):
        configured: bool
        key_suffix: str | None = None

    class AiOpsSummaryResponse(BaseModel):
        openrouter_configured: bool
        notes: list[str] = Field(default_factory=list)
        providers: dict[str, AiProviderKeyRow] = Field(default_factory=dict)
        model_routing: dict[str, str] = Field(default_factory=dict)
        rate_limits: dict[str, dict[str, int | str]] = Field(default_factory=dict)
        agents: list[dict[str, str]] = Field(default_factory=list)
        operator_hints: list[str] = Field(default_factory=list)

    @router.get("/admin/ai/summary", response_model=AiOpsSummaryResponse)
    def ai_summary(
        request: Request,
        admin: dict[str, Any] = Depends(require_admin),
    ) -> AiOpsSummaryResponse:
        _admin_throttle(request, str(admin.get("id") or ""))
        if not role_has_permission(str(admin.get("role")), PERM_AI_OPS):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        from config import settings as cfg

        ok = bool((cfg.openrouter_api_key or "").strip())
        notes: list[str] = []
        if not ok:
            notes.append("OPENROUTER_API_KEY is not configured — paid model routing and completions will fail.")

        providers = {
            "openrouter": AiProviderKeyRow(configured=ok, key_suffix=_secret_tail(cfg.openrouter_api_key)),
            "groq": AiProviderKeyRow(
                configured=bool((cfg.groq_api_key or "").strip()),
                key_suffix=_secret_tail(cfg.groq_api_key),
            ),
            "google_ai_gemini": AiProviderKeyRow(
                configured=bool((cfg.google_ai_api_key or "").strip()),
                key_suffix=_secret_tail(cfg.google_ai_api_key),
            ),
            "pexels_stock_media": AiProviderKeyRow(
                configured=bool((cfg.pexels_api_key or "").strip()),
                key_suffix=_secret_tail(cfg.pexels_api_key),
            ),
        }

        model_routing = {
            "openrouter_default": cfg.openrouter_model,
            "fast_model": cfg.openrouter_fast_model,
            "smart_model": cfg.openrouter_smart_model,
            "vision_model": cfg.openrouter_vision_model,
            "image_model": cfg.openrouter_image_model,
            "gemini_model": cfg.gemini_model,
            "groq_model": cfg.groq_model,
        }

        agents = [
            {
                "id": "agent_1",
                "label": "Agent 1 — Strategy & competitor research (strategy-only on POST /strategy)",
                "summary": (
                    "HTTP POST /strategy. Consumes workspace company name, website, scenario, primary region, optional competitor seeds. "
                    "Produces strategy rows, competitor cards, and locked JSON consumed by Agent 2. Highest token cost per run."
                ),
            },
            {
                "id": "agent_2",
                "label": "Agent 2 — Content calendar & drafts",
                "summary": (
                    "HTTP POST /content with action=generate. Uses Agent 1 outputs already stored on the workspace. "
                    "If no strategy exists yet, the server runs the full Agent 1→2 pipeline once and replaces content."
                ),
            },
            {
                "id": "aux_content_suggest",
                "label": "Single-post suggest",
                "summary": (
                    "HTTP POST /content with action=suggest. Lightweight draft suggestion; shares the same per-user rate bucket as generate."
                ),
            },
            {
                "id": "workspace_search",
                "label": "Workspace Q&A",
                "summary": "HTTP POST /workspace/search. Answers using compact workspace context plus your question.",
            },
            {
                "id": "creative_tools",
                "label": "Carousel & image prompts",
                "summary": (
                    "HTTP POST /ai/carousel and /ai/image-prompt. Generates structured carousel ideas or a production-style image prompt "
                    "(pixels come from your chosen image provider; this stack only drafts the prompt unless wired elsewhere)."
                ),
            },
            {
                "id": "analytics_agent",
                "label": "Analytics narrative",
                "summary": "HTTP POST /analytics/analyze. Turns metrics + caption into an insights narrative.",
            },
        ]

        operator_hints = [
            "Secrets and model IDs load from the API process environment at startup. Update your host env or backend/.env, then restart the server — there is no hot-reload of API keys from this UI.",
            "Per-user abuse caps use sliding windows: AI_RATE_LIMIT_STRATEGY_MAX + AI_RATE_LIMIT_STRATEGY_WINDOW_SECONDS (and parallel CONTENT_, CREATIVE_, SEARCH_, ANALYTICS_ variables). Set any *_MAX to 0 to turn off that bucket.",
            "Changing OPENROUTER_MODEL, FAST_MODEL, SMART_MODEL, VISION_MODEL, IMAGE_MODEL, GEMINI_MODEL, or GROQ_MODEL adjusts routing without code changes.",
        ]

        return AiOpsSummaryResponse(
            openrouter_configured=ok,
            notes=notes,
            providers=providers,
            model_routing=model_routing,
            rate_limits=public_rate_limits(cfg),
            agents=agents,
            operator_hints=operator_hints,
        )

    class AnalyticsGrowthPoint(BaseModel):
        label: str
        value: float

    class AnalyticsOverviewResponse(BaseModel):
        dau_estimate: int | None = None
        token_usage_placeholder: float | None = None
        series: list[AnalyticsGrowthPoint]

    @router.get("/admin/analytics/overview", response_model=AnalyticsOverviewResponse)
    def analytics_overview(
        request: Request,
        admin: dict[str, Any] = Depends(require_admin),
        db: Session = Depends(get_db),
    ) -> AnalyticsOverviewResponse:
        _admin_throttle(request, str(admin.get("id") or ""))
        if not role_has_permission(str(admin.get("role")), PERM_OPS):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        dau: int | None = None
        try:
            row = db.execute(
                text(
                    """
                    select count(*)::int as n
                    from flowpilot_users
                    where deleted_at is null
                      and created_at >= now() - interval '1 day'
                    """
                )
            ).mappings().first()
            if row:
                dau = int(row["n"] or 0)
        except SQLAlchemyError:
            dau = None
        series = [
            AnalyticsGrowthPoint(label="Activation (24h)", value=float(dau or 0)),
            AnalyticsGrowthPoint(label="Engagement index", value=0.0),
            AnalyticsGrowthPoint(label="AI throughput", value=0.0),
        ]
        return AnalyticsOverviewResponse(dau_estimate=dau, token_usage_placeholder=None, series=series)

    @router.get("/admin/db/export-enabled")
    def db_export_flag(admin: dict[str, Any] = Depends(require_admin)) -> dict[str, bool]:
        return {"allowed": role_has_permission(str(admin.get("role")), PERM_DB_EXPORT)}

    @router.get("/admin/audit/export-enabled")
    def audit_export_flag(admin: dict[str, Any] = Depends(require_admin)) -> dict[str, bool]:
        return {"allowed": role_has_permission(str(admin.get("role")), PERM_AUDIT_EXPORT)}

    return router
