from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Generator, Iterable

from sqlalchemy import CheckConstraint, Column, DateTime, Index, Integer, String, Text, create_engine, select, text
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from config import settings


CONTENT_STATUSES = ("draft", "approved", "scheduled", "published", "failed", "rejected")

Base = declarative_base()


class Content(Base):
    __tablename__ = "content"
    __table_args__ = (
        CheckConstraint("status in ('draft', 'approved', 'scheduled', 'published', 'failed', 'rejected')", name="content_status_check"),
        Index("idx_content_status", "status"),
        Index("idx_content_due_approved", "scheduled_time", postgresql_where=text("status = 'approved'")),
    )

    id = Column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    platform = Column(String(32), nullable=False, index=True)
    content = Column(Text, nullable=False)
    media_url = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft")
    scheduled_time = Column(DateTime(timezone=True), nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class NotificationState(Base):
    __tablename__ = "notification_state"

    key = Column(String(64), primary_key=True)
    last_sent_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


if not settings.database_url:
    engine = None
    SessionLocal = None
else:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        future=True,
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def init_db() -> None:
    if engine is None:
        raise RuntimeError("DATABASE_URL is required to initialize the backend database")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text("alter table content drop constraint if exists content_status_check"))
        connection.execute(
            text(
                "alter table content add constraint content_status_check "
                "check (status in ('draft', 'approved', 'scheduled', 'published', 'failed', 'rejected'))"
            )
        )
        _init_workspace_tables(connection)


def _init_workspace_tables(connection: object) -> None:
    """FlowPilot: every flowpilot_* table is keyed by workspace_id — no shared strategy across businesses."""
    statements = [
        """
        create table if not exists flowpilot_users (
            id text primary key,
            name text not null,
            email text not null unique,
            password text not null,
            auth_provider text,
            auth_subject text,
            created_at timestamptz not null default now()
        )
        """,
        "alter table flowpilot_users add column if not exists auth_provider text",
        "alter table flowpilot_users add column if not exists auth_subject text",
        "create unique index if not exists uq_flowpilot_users_auth_identity on flowpilot_users(auth_provider, auth_subject) where auth_provider is not null and auth_subject is not null",
        """
        create table if not exists flowpilot_workspace (
            workspace_id text primary key,
            company_name text not null default '',
            company_website text not null default '',
            workspace_scenario text not null default 'b2b-saas',
            primary_region text not null default 'uae-india',
            workspace_configured boolean not null default false,
            crm_last_bulk_status text not null default 'Pending',
            updated_at timestamptz not null default now()
        )
        """,
        "alter table flowpilot_workspace add column if not exists primary_region text not null default 'uae-india'",
        "update flowpilot_workspace set primary_region = 'uae-india' where coalesce(lower(trim(primary_region)), '') = 'global'",
        "alter table flowpilot_workspace alter column primary_region set default 'uae-india'",
        "alter table flowpilot_workspace add column if not exists master_setup_json text not null default ''",
        """
        create table if not exists flowpilot_profile (
            workspace_id text primary key references flowpilot_workspace(workspace_id) on delete cascade,
            name text not null default '',
            email text not null default '',
            company text not null default '',
            timezone text not null default 'Asia/Kolkata',
            updated_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists flowpilot_preferences (
            workspace_id text primary key references flowpilot_workspace(workspace_id) on delete cascade,
            default_platform text not null default 'linkedin',
            quiet_hours_enabled boolean not null default true,
            approval_digest text not null default 'daily',
            updated_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists flowpilot_strategy (
            workspace_id text primary key references flowpilot_workspace(workspace_id) on delete cascade,
            target_audience text not null default '',
            content_themes text[] not null default '{}',
            platform_focus text[] not null default '{}',
            market_gaps text[] not null default '{}',
            updated_at timestamptz not null default now()
        )
        """,
        "alter table flowpilot_strategy add column if not exists strategy_version integer not null default 1",
        "alter table flowpilot_strategy add column if not exists strategy_locked boolean not null default false",
        "alter table flowpilot_strategy add column if not exists data_json text not null default ''",
        """
        create table if not exists flowpilot_competitors (
            id text primary key,
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            name text not null,
            positioning text not null default '',
            strengths text[] not null default '{}',
            weaknesses text[] not null default '{}'
        )
        """,
        "alter table flowpilot_competitors add column if not exists domain text not null default ''",
        "alter table flowpilot_competitors add column if not exists market_rank text not null default ''",
        "alter table flowpilot_competitors add column if not exists market_gap text not null default ''",
        "alter table flowpilot_competitors add column if not exists marketing_purpose text not null default ''",
        """
        create table if not exists flowpilot_content (
            id text primary key,
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            title text not null,
            content_text text not null,
            media_type text not null default 'Image',
            media_preview text not null default '',
            status text not null default 'PENDING',
            selected_platform text,
            scheduled_at timestamptz,
            created_at timestamptz not null default now()
        )
        """,
        # Legacy DBs may have flowpilot_content without created_at; backfill before updated_at uses it.
        "alter table flowpilot_content add column if not exists created_at timestamptz",
        "update flowpilot_content set created_at = now() where created_at is null",
        "alter table flowpilot_content alter column created_at set default now()",
        "alter table flowpilot_content alter column created_at set not null",
        "alter table flowpilot_content add column if not exists updated_at timestamptz",
        "update flowpilot_content set updated_at = coalesce(created_at, now()) where updated_at is null",
        "alter table flowpilot_content alter column updated_at set default now()",
        "alter table flowpilot_content alter column updated_at set not null",
        "alter table flowpilot_content add column if not exists strategy_version integer not null default 1",
        """
        create table if not exists flowpilot_activities (
            id text primary key,
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            text text not null,
            created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists flowpilot_integrations (
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            platform text not null,
            connected boolean not null default false,
            account_name text,
            account_handle text,
            updated_at timestamptz not null default now(),
            primary key (workspace_id, platform)
        )
        """,
        # Older DBs may have been created before updated_at existed; CREATE TABLE IF NOT EXISTS does not add columns.
        "alter table flowpilot_integrations add column if not exists updated_at timestamptz not null default now()",
        """
        create table if not exists flowpilot_publishing_log (
            id text primary key,
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            content_id text not null,
            platform text not null,
            timestamp timestamptz not null default now(),
            status text not null default 'Success'
        )
        """,
        """
        create table if not exists flowpilot_media_library (
            id text primary key,
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            name text not null,
            media_type text not null default 'Image',
            media_url text not null,
            created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists flowpilot_leads (
            id text primary key,
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            name text not null,
            email text not null,
            source text not null default 'Publishing',
            status text not null default 'New',
            crm_status text not null default 'Pending',
            captured_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists flowpilot_campaigns (
            id text primary key,
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            name text not null,
            budget integer not null default 0,
            status text not null default 'Draft'
        )
        """,
        """
        create table if not exists flowpilot_engagement_series (
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            position integer not null,
            name text not null,
            engagement integer not null default 0,
            reach integer not null default 0,
            primary key (workspace_id, position)
        )
        """,
        """
        create table if not exists flowpilot_leads_growth (
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            position integer not null,
            name text not null,
            leads integer not null default 0,
            primary key (workspace_id, position)
        )
        """,
        "create index if not exists idx_flowpilot_content_workspace_status on flowpilot_content(workspace_id, status)",
        "create index if not exists idx_flowpilot_content_workspace_schedule on flowpilot_content(workspace_id, scheduled_at)",
        "create index if not exists idx_flowpilot_publishing_log_workspace_time on flowpilot_publishing_log(workspace_id, timestamp desc)",
        """
        create table if not exists flowpilot_post_analytics (
            workspace_id text not null references flowpilot_workspace(workspace_id) on delete cascade,
            content_id text not null,
            performance_json text not null default '{}',
            updated_at timestamptz not null default now(),
            primary key (workspace_id, content_id)
        )
        """,
        """
        create table if not exists social_accounts (
            id uuid primary key,
            user_id text not null,
            workspace_id text not null,
            platform text not null,
            account_id text,
            account_name text,
            access_token text,
            refresh_token text,
            expires_at timestamptz,
            meta_page_id text,
            meta_page_token text,
            meta_ig_id text,
            is_active boolean not null default true,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        )
        """,
        "alter table social_accounts add column if not exists platform text",
        "alter table social_accounts add column if not exists account_id text",
        "alter table social_accounts add column if not exists account_name text",
        "alter table social_accounts add column if not exists access_token text",
        "alter table social_accounts add column if not exists refresh_token text",
        "alter table social_accounts add column if not exists expires_at timestamptz",
        "alter table social_accounts add column if not exists meta_page_id text",
        "alter table social_accounts add column if not exists meta_page_token text",
        "alter table social_accounts add column if not exists meta_ig_id text",
        "alter table social_accounts add column if not exists user_id text",
        "alter table social_accounts add column if not exists workspace_id text",
        "alter table social_accounts add column if not exists is_active boolean not null default true",
        "alter table social_accounts add column if not exists updated_at timestamptz not null default now()",
        """
        do $$
        begin
            if not exists (
                select 1
                from pg_constraint
                where conname = 'social_accounts_platform_check'
            ) then
                alter table social_accounts
                add constraint social_accounts_platform_check
                check (platform in ('linkedin','meta'));
            end if;
        end $$;
        """,
        "create unique index if not exists uq_social_accounts_user_workspace_platform_account on social_accounts(user_id, workspace_id, platform, account_id)",
        """
        create table if not exists posts (
            id uuid primary key,
            user_id text not null,
            workspace_id text not null,
            content text not null default '',
            media_url text,
            status text not null default 'draft',
            scheduled_at timestamptz,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        )
        """,
        "alter table posts add column if not exists status text not null default 'draft'",
        "alter table posts add column if not exists scheduled_at timestamptz",
        "alter table posts add column if not exists workspace_id text",
        "alter table posts add column if not exists updated_at timestamptz not null default now()",
        "alter table posts add column if not exists user_id text",
        """
        create table if not exists post_targets (
            id uuid primary key,
            post_id uuid not null references posts(id) on delete cascade,
            platform text not null,
            social_account_id uuid,
            status text not null default 'pending',
            response jsonb not null default '{}'::jsonb,
            created_at timestamptz not null default now()
        )
        """,
        """
        create table if not exists flowpilot_oauth_nonce (
            nonce text primary key,
            user_id text not null,
            workspace_id text not null,
            expires_at timestamptz not null,
            used_at timestamptz,
            created_at timestamptz not null default now()
        )
        """,
        "create index if not exists idx_social_accounts_user_id on social_accounts(user_id)",
        "create index if not exists idx_social_accounts_workspace_id on social_accounts(workspace_id)",
        "create index if not exists idx_posts_user_id on posts(user_id)",
        "create index if not exists idx_posts_workspace_id on posts(workspace_id)",
        "create index if not exists idx_posts_status_schedule on posts(status, scheduled_at)",
        "create index if not exists idx_post_targets_post_id on post_targets(post_id)",
        "alter table social_accounts enable row level security",
        "alter table posts enable row level security",
        "alter table post_targets enable row level security",
        "drop policy if exists social_accounts_owner_policy on social_accounts",
        "create policy social_accounts_owner_policy on social_accounts for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id)",
        "drop policy if exists posts_owner_policy on posts",
        "create policy posts_owner_policy on posts for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id)",
        "drop policy if exists post_targets_owner_policy on post_targets",
        "create policy post_targets_owner_policy on post_targets for all using (exists (select 1 from posts p where p.id = post_targets.post_id and auth.uid()::text = p.user_id)) with check (exists (select 1 from posts p where p.id = post_targets.post_id and auth.uid()::text = p.user_id))",
    ]
    for statement in statements:
        connection.execute(text(statement))


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is required")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_content(
    db: Session,
    *,
    platform: str,
    content: str,
    media_url: str | None = None,
    status: str = "draft",
    scheduled_time: datetime | None = None,
) -> Content:
    if status not in CONTENT_STATUSES:
        raise ValueError(f"Unsupported content status: {status}")

    row = Content(
        platform=platform.lower().strip(),
        content=content.strip(),
        media_url=media_url.strip() if media_url else None,
        status=status,
        scheduled_time=scheduled_time,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_many_content(db: Session, posts: Iterable[dict[str, str | None]]) -> list[Content]:
    rows = [
        Content(
            platform=str(post["platform"]).lower().strip(),
            content=str(post["content"]).strip(),
            media_url=str(post["media_url"]).strip() if post.get("media_url") else None,
            status="draft",
        )
        for post in posts
    ]
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def get_content(db: Session, content_id: uuid.UUID) -> Content | None:
    return db.get(Content, content_id)


def get_all_content(db: Session) -> list[Content]:
    return list(db.scalars(select(Content).order_by(Content.created_at.desc())).all())


def get_due_posts(db: Session, now: datetime | None = None) -> list[Content]:
    current_time = now or datetime.now(timezone.utc)
    return list(
        db.scalars(
            select(Content)
            .where(Content.status == "approved")
            .where(Content.scheduled_time.is_not(None))
            .where(Content.scheduled_time <= current_time)
            .order_by(Content.scheduled_time.asc())
        ).all()
    )


def update_status(db: Session, content_id: uuid.UUID, status: str, scheduled_time: datetime | None = None) -> Content | None:
    if status not in CONTENT_STATUSES:
        raise ValueError(f"Unsupported content status: {status}")
    row = get_content(db, content_id)
    if row is None:
        return None
    row.status = status
    if scheduled_time is not None:
        row.scheduled_time = scheduled_time
    db.commit()
    db.refresh(row)
    return row


def increment_retry(db: Session, content_id: uuid.UUID) -> Content | None:
    row = get_content(db, content_id)
    if row is None:
        return None
    row.retry_count += 1
    db.commit()
    db.refresh(row)
    return row


def get_notification_state(db: Session, key: str) -> NotificationState | None:
    return db.get(NotificationState, key)


def update_notification_state(db: Session, key: str, sent_at: datetime | None = None) -> NotificationState:
    row = get_notification_state(db, key)
    now = datetime.now(timezone.utc)
    if row is None:
        row = NotificationState(key=key, last_sent_at=sent_at or now, updated_at=now)
        db.add(row)
    else:
        row.last_sent_at = sent_at or now
        row.updated_at = now
    db.commit()
    db.refresh(row)
    return row
