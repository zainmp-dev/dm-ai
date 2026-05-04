-- Additive: native ads campaign audit trail (no changes to posts / post_targets / social_accounts).
create table if not exists ads_campaigns (
    id uuid primary key,
    user_id text not null,
    workspace_id text not null,
    post_id uuid not null,
    platform text not null,
    campaign_id text,
    ad_id text,
    budget numeric,
    status text not null default 'pending',
    created_at timestamptz not null default now()
);

create index if not exists idx_ads_campaigns_user_id on ads_campaigns(user_id);
create index if not exists idx_ads_campaigns_workspace_id on ads_campaigns(workspace_id);
create index if not exists idx_ads_campaigns_post_id on ads_campaigns(post_id);

alter table ads_campaigns enable row level security;

drop policy if exists ads_campaigns_owner_policy on ads_campaigns;
create policy ads_campaigns_owner_policy on ads_campaigns
    for all
    using (auth.uid()::text = user_id)
    with check (auth.uid()::text = user_id);
