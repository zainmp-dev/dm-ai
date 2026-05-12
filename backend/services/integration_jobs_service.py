"""Lightweight persistence queue for platform sync (Celery-free MVP; scheduler drains)."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 8

_COMPLETABLE_KINDS = frozenset({"unpublish_verify", "analytics_refresh", "noop"})


def enqueue_job(
    db: Session,
    *,
    user_id: str,
    workspace_id: str,
    kind: str,
    idempotency_key: str,
    payload: dict[str, Any] | None = None,
    delay_seconds: int = 0,
) -> str:
    jid = str(uuid.uuid4())
    next_run = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
    db.execute(
        text(
            """
            insert into integration_jobs (
                id, workspace_id, user_id, kind, idempotency_key, payload, status, attempts, next_run_at, created_at, updated_at
            )
            values (
                cast(:id as uuid), :workspace_id, :user_id, :kind, :idempotency_key, cast(:payload as jsonb),
                'pending', 0, :next_run, now(), now()
            )
            on conflict (workspace_id, kind, idempotency_key) do update set
                payload = excluded.payload,
                status = case when integration_jobs.status = 'dead' then integration_jobs.status else 'pending' end,
                next_run_at = excluded.next_run_at,
                updated_at = now()
            """
        ),
        {
            "id": jid,
            "workspace_id": workspace_id,
            "user_id": user_id,
            "kind": kind,
            "idempotency_key": idempotency_key,
            "payload": json.dumps(payload or {}),
            "next_run": next_run,
        },
    )
    db.commit()
    return jid


def process_due_jobs_once(db: Session) -> int:
    """Drain a small batch of pending jobs (placeholder handlers)."""
    now = datetime.now(timezone.utc)
    rows = db.execute(
        text(
            """
            select id, kind, attempts
            from integration_jobs
            where status = 'pending' and next_run_at <= :now
            order by next_run_at asc
            limit 10
            """
        ),
        {"now": now},
    ).mappings().all()
    touched = 0
    for row in rows:
        jid = str(row["id"])
        attempts = int(row["attempts"] or 0) + 1
        kind = str(row["kind"])
        if kind in _COMPLETABLE_KINDS:
            db.execute(
                text(
                    """
                    update integration_jobs
                    set status = 'completed', attempts = :attempts, updated_at = now(), last_error = null
                    where id = cast(:id as uuid)
                    """
                ),
                {"id": jid, "attempts": attempts},
            )
            touched += 1
        elif attempts >= MAX_ATTEMPTS:
            db.execute(
                text(
                    """
                    update integration_jobs
                    set status = 'dead', attempts = :attempts,
                        last_error = cast(:err as jsonb), updated_at = now()
                    where id = cast(:id as uuid)
                    """
                ),
                {
                    "id": jid,
                    "attempts": attempts,
                    "err": json.dumps({"message": "max attempts"}),
                },
            )
            touched += 1
        else:
            delay_sec = min(3600, 30 * (2 ** min(attempts, 6)))
            next_run = datetime.now(timezone.utc) + timedelta(seconds=delay_sec)
            db.execute(
                text(
                    """
                    update integration_jobs
                    set attempts = :attempts, next_run_at = :next_run, updated_at = now()
                    where id = cast(:id as uuid)
                    """
                ),
                {"id": jid, "attempts": attempts, "next_run": next_run},
            )
            touched += 1
    if touched:
        db.commit()
    return touched
