from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def record_admin_audit(
    db: Session,
    *,
    actor_id: str,
    actor_email: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None,
    meta: dict[str, Any] | None,
    ip: str | None,
) -> None:
    payload = json.dumps(meta or {}, default=str)
    db.execute(
        text(
            """
            insert into flowpilot_admin_audit (
              actor_id, actor_email, action, resource_type, resource_id, meta, ip
            )
            values (
              :actor_id, :actor_email, :action, :resource_type, :resource_id,
              CAST(:meta AS jsonb), :ip
            )
            """
        ),
        {
            "actor_id": actor_id,
            "actor_email": (actor_email or "").strip() or None,
            "action": action[:240],
            "resource_type": (resource_type or "")[:120],
            "resource_id": (resource_id or "")[:240] or None,
            "meta": payload,
            "ip": (ip or "")[:80] or None,
        },
    )


def fetch_audit_page(
    db: Session,
    *,
    page: int,
    page_size: int,
    q: str,
) -> tuple[list[dict[str, Any]], int]:
    where_sql = "TRUE"
    params: dict[str, Any] = {"limit": page_size, "offset": (page - 1) * page_size}
    q_plain = q.strip()[:220].lower()
    if q_plain:
        params["q"] = q_plain
        where_sql = (
            "("
            "position(:q in lower(coalesce(action, ''))) > 0 "
            "or position(:q in lower(coalesce(resource_type, ''))) > 0 "
            "or position(:q in lower(coalesce(resource_id, ''))) > 0 "
            "or position(:q in lower(coalesce(actor_email, ''))) > 0 "
            "or position(:q in lower(coalesce(actor_id, ''))) > 0"
            ")"
        )

    total_row = db.execute(
        text(f"select count(*)::int as n from flowpilot_admin_audit where {where_sql}"),
        {k: v for k, v in params.items() if k not in {"limit", "offset"}},
    ).mappings().first()
    total = int(total_row["n"] or 0) if total_row is not None else 0

    rows = db.execute(
        text(
            f"""
            select id, actor_id, actor_email, action, resource_type, resource_id, meta, ip, created_at
            from flowpilot_admin_audit
            where {where_sql}
            order by created_at desc nulls last, id desc
            limit :limit offset :offset
            """
        ),
        params,
    ).mappings().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        rd = dict(r)
        meta = rd.get("meta")
        if meta is not None and not isinstance(meta, dict):
            try:
                rd["meta"] = dict(meta)  # type: ignore[arg-type]
            except Exception:
                rd["meta"] = {}
        out.append(rd)
    return out, total
