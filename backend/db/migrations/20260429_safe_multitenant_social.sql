-- Safe migration: additive only, backward compatible.

create table if not exists social_accounts (
    id uuid primary key,
    platform text,
    account_id text,
    account_name text,
    access_token text,
    refresh_token text,
    expires_at timestamptz,
    meta_page_id text,
    meta_page_token text,
    meta_ig_id text,
    user_id text,
    workspace_id text,
    is_active boolean default true,
    updated_at timestamptz default now(),
    created_at timestamptz default now()
);

alter table social_accounts add column if not exists platform text;
alter table social_accounts add column if not exists account_id text;
alter table social_accounts add column if not exists account_name text;
alter table social_accounts add column if not exists access_token text;
alter table social_accounts add column if not exists refresh_token text;
alter table social_accounts add column if not exists expires_at timestamptz;
alter table social_accounts add column if not exists meta_page_id text;
alter table social_accounts add column if not exists meta_page_token text;
alter table social_accounts add column if not exists meta_ig_id text;
alter table social_accounts add column if not exists user_id text;
alter table social_accounts add column if not exists workspace_id text;
alter table social_accounts add column if not exists is_active boolean default true;
alter table social_accounts add column if not exists updated_at timestamptz default now();

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'social_accounts_platform_check') then
        alter table social_accounts
        add constraint social_accounts_platform_check
        check (platform in ('linkedin', 'meta'));
    end if;
end $$;

create table if not exists posts (
    id uuid primary key,
    user_id text,
    workspace_id text,
    content text,
    media_url text,
    status text default 'draft',
    scheduled_at timestamptz,
    updated_at timestamptz default now(),
    created_at timestamptz default now()
);

alter table posts add column if not exists status text default 'draft';
alter table posts add column if not exists scheduled_at timestamptz;
alter table posts add column if not exists workspace_id text;
alter table posts add column if not exists user_id text;
alter table posts add column if not exists updated_at timestamptz default now();

create table if not exists post_targets (
    id uuid primary key,
    post_id uuid,
    platform text,
    social_account_id uuid,
    status text default 'pending',
    response jsonb,
    created_at timestamptz default now()
);

create unique index if not exists uq_social_accounts_user_workspace_platform_account
on social_accounts (user_id, workspace_id, platform, account_id);
create index if not exists idx_social_accounts_user_id on social_accounts (user_id);
create index if not exists idx_social_accounts_workspace_id on social_accounts (workspace_id);
create index if not exists idx_posts_user_id on posts (user_id);
create index if not exists idx_posts_workspace_id on posts (workspace_id);

alter table social_accounts enable row level security;
alter table posts enable row level security;
alter table post_targets enable row level security;

drop policy if exists social_accounts_owner_policy on social_accounts;
create policy social_accounts_owner_policy
on social_accounts
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists posts_owner_policy on posts;
create policy posts_owner_policy
on posts
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists post_targets_owner_policy on post_targets;
create policy post_targets_owner_policy
on post_targets
for all
using (
    exists (
        select 1 from posts p
        where p.id = post_targets.post_id
          and auth.uid()::text = p.user_id
    )
)
with check (
    exists (
        select 1 from posts p
        where p.id = post_targets.post_id
          and auth.uid()::text = p.user_id
    )
);
