"use client";

import { format } from "date-fns";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Layers,
  Plug,
  ScrollText,
  Shield,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useAdminPlatformSession } from "@/components/admin/admin-platform-context";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminOverviewOptional } from "@/components/admin/admin-shell";
import { filterNavForPermissions } from "@/lib/admin/nav-config";
import { PERM, permissionGranted, type PermissionKey } from "@/lib/admin/permissions";
import { cn } from "@/lib/utils";

const SECTION_BLURB: Record<string, string> = {
  "/admin/analytics": "Trends and growth proxies",
  "/admin/database": "Inventory, metrics, read-only inspection",
  "/admin/users": "Accounts, roles, passwords, onboarding",
  "/admin/workspaces": "Tenants, company data, library depth",
  "/admin/integrations": "OAuth connections by channel",
  "/admin/content": "Pipeline status across workspaces",
  "/admin/operations": "Throughput, queues, and jobs",
  "/admin/ai": "AI configuration visibility",
  "/admin/audit": "Immutable admin action history",
  "/admin/security": "RBAC registry and permission matrix",
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  href,
  subtitle,
}: {
  label: string;
  value: number | string;
  hint?: string;
  subtitle?: string;
  icon: typeof Users;
  accent: string;
  /** When set (and interactive), entire card navigates here */
  href?: string;
}) {
  const interactive = Boolean(href);
  const inner = (
    <Card
      className={cn(
        "h-full overflow-hidden rounded-2xl border-[#e5e7eb] bg-white shadow-sm dark:border-zinc-800 dark:bg-[#161618]",
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-200 hover:border-[#1a56db]/30 hover:shadow-md group-hover:border-[#1a56db]/30 dark:hover:border-blue-500/35",
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b] dark:text-zinc-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[#0f172a] dark:text-zinc-50">{value}</p>
            {subtitle ? (
              <p className="mt-1 text-[12px] font-medium leading-snug text-[#475569] dark:text-zinc-400">{subtitle}</p>
            ) : null}
            {hint ? <p className="mt-1.5 text-[12px] leading-snug text-[#64748b] dark:text-zinc-500">{hint}</p> : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className="flex size-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-[1.02]"
              style={{ backgroundColor: `${accent}18`, color: accent }}
            >
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
            {interactive ? (
              <ArrowUpRight className="size-4 text-[#94a3b8] opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-500" aria-hidden />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="group block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#1a56db]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f7fa] dark:focus-visible:ring-offset-[#0c0c0e]">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function AdminOverviewPage() {
  const overview = useAdminOverviewOptional();
  const platformSession = useAdminPlatformSession();
  const perms = platformSession?.permissions ?? [];

  const allowedHref = useMemo(
    () => (required: PermissionKey | undefined, path: string) =>
      permissionGranted(perms, required) ? path : undefined,
    [perms],
  );

  const navDestinations = useMemo(() => filterNavForPermissions(perms).filter((n) => n.href !== "/admin"), [perms]);

  const pct = useMemo(() => {
    if (!overview || overview.workspace_rows <= 0) return null;
    return Math.round((100 * overview.configured_workspaces) / overview.workspace_rows);
  }, [overview]);

  const generatedAt = useMemo(() => {
    try {
      return format(new Date(), "MMM d, yyyy · h:mm a");
    } catch {
      return "";
    }
  }, []);

  const integrationPct = useMemo(() => {
    if (!overview || overview.integration_rows <= 0) return null;
    return Math.round((100 * overview.integrations_connected) / overview.integration_rows);
  }, [overview]);

  if (!overview) {
    return null;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] text-[#64748b] dark:text-zinc-500">
            Live database counts — click a KPI or destination card to jump into that area of the console.
          </p>
          <p className="mt-1 text-[11px] text-[#94a3b8] dark:text-zinc-600">Snapshot loaded · {generatedAt}</p>
        </div>
      </div>

      <section aria-label="Key metrics">
        <h2 className="sr-only">Key metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Registered accounts"
            value={overview.total_users}
            hint={`${overview.admin_count} platform operator seats`}
            icon={Users}
            accent="#1a56db"
            href={allowedHref(PERM.USERS, "/admin/users")}
          />
          <StatCard
            label="Workspaces"
            value={overview.workspace_rows}
            subtitle={pct != null ? `${pct}% fully configured` : undefined}
            hint={`${overview.configured_workspaces} ready · ${Math.max(0, overview.workspace_rows - overview.configured_workspaces)} in progress`}
            icon={Building2}
            accent="#059669"
            href={allowedHref(PERM.WORKSPACES, "/admin/workspaces")}
          />
          <StatCard
            label="Sign-in mix"
            value={`${overview.oauth_users} OAuth`}
            subtitle={`${overview.password_only_users} email / password`}
            hint="Across all registered accounts"
            icon={KeyRound}
            accent="#7c3aed"
            href={allowedHref(PERM.USERS, "/admin/users")}
          />
          <StatCard
            label="Content library"
            value={overview.total_content_items}
            hint="Items across workspaces"
            icon={Layers}
            accent="#d97706"
            href={allowedHref(PERM.CONTENT_LIB, "/admin/content")}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Competitor profiles"
            value={overview.total_competitors}
            hint="Rows in competitor research tables"
            icon={Target}
            accent="#0891b2"
            href={allowedHref(PERM.WORKSPACES, "/admin/workspaces")}
          />
          <StatCard
            label="Integrations"
            value={`${overview.integrations_connected}/${overview.integration_rows}`}
            subtitle={integrationPct != null ? `${integrationPct}% connected` : undefined}
            hint="Channel rows for active workspaces"
            icon={Plug}
            accent="#db2777"
            href={allowedHref(PERM.INTEGRATIONS, "/admin/integrations")}
          />
          <StatCard
            label="Audit events"
            value={overview.admin_audit_events}
            hint="Privileged actions recorded"
            icon={ScrollText}
            accent="#4f46e5"
            href={allowedHref(PERM.AUDIT_READ, "/admin/audit")}
          />
          <StatCard
            label="Setup throughput"
            value={overview.workspace_rows ? `${pct ?? 0}%` : "—"}
            hint="Share of workspaces marked configured"
            icon={CheckCircle2}
            accent="#16a34a"
            href={allowedHref(PERM.USERS, "/admin/users")}
          />
        </div>
      </section>

      {navDestinations.length > 0 ? (
        <section aria-label="Console destinations">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#64748b] dark:text-zinc-500">
            Go to section
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {navDestinations.map(({ href, label, icon: Icon }) => {
              const blurb = SECTION_BLURB[href] ?? "Open in console";
              return (
                <Link
                  key={href}
                  href={href}
                  className="group flex gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-4 outline-none transition-[border-color,box-shadow] hover:border-[#1a56db]/28 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[#1a56db]/40 dark:border-zinc-800 dark:bg-[#161618] dark:hover:border-blue-500/30"
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#1a56db]/10 text-[#1a56db] dark:bg-blue-500/15 dark:text-blue-300"
                    aria-hidden
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold text-[#0f172a] dark:text-zinc-50">
                      {label}
                      <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                    </span>
                    <span className="mt-1 block text-[12px] leading-snug text-[#64748b] dark:text-zinc-500">{blurb}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618] lg:col-span-2">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-[#1a56db]" strokeWidth={1.75} />
              <h2 className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Operational notes</h2>
            </div>
            <ul className="space-y-3 text-[13px] leading-relaxed text-[#475569] dark:text-zinc-400">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span>
                  Use{" "}
                  {permissionGranted(perms, PERM.USERS) ? (
                    <Link
                      href="/admin/users"
                      className="font-medium text-[#1a56db] underline-offset-4 hover:underline dark:text-blue-400"
                    >
                      Users
                    </Link>
                  ) : (
                    <strong className="font-medium text-[#0f172a] dark:text-zinc-200">Users</strong>
                  )}{" "}
                  to audit onboarding, scenarios, and libraries; KPI cards above jump to filtered areas where relevant.
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span>Platform operators skip the workspace wizard and use this console instead of a marketing workspace.</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span>
                  If the UI is unreachable, bootstrap access with{" "}
                  <code className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 text-[11px] dark:bg-zinc-800">backend/promote_admin.py</code>
                  .
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardContent className="space-y-4 p-6">
            <h2 className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Ratios</h2>
            <dl className="space-y-3 text-[13px]">
              <div className="flex justify-between gap-2 border-b border-dashed border-[#e5e7eb] pb-3 dark:border-zinc-800">
                <dt className="text-[#64748b] dark:text-zinc-500">Workspaces / account</dt>
                <dd className="font-medium tabular-nums text-[#0f172a] dark:text-zinc-100">
                  {overview.total_users ? (overview.workspace_rows / overview.total_users).toFixed(2) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-dashed border-[#e5e7eb] pb-3 dark:border-zinc-800">
                <dt className="text-[#64748b] dark:text-zinc-500">Content / workspace</dt>
                <dd className="font-medium tabular-nums text-[#0f172a] dark:text-zinc-100">
                  {overview.workspace_rows ? (overview.total_content_items / overview.workspace_rows).toFixed(1) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-dashed border-[#e5e7eb] pb-3 dark:border-zinc-800">
                <dt className="text-[#64748b] dark:text-zinc-500">Competitors / workspace</dt>
                <dd className="font-medium tabular-nums text-[#0f172a] dark:text-zinc-100">
                  {overview.workspace_rows ? (overview.total_competitors / overview.workspace_rows).toFixed(1) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#64748b] dark:text-zinc-500">OAuth adoption</dt>
                <dd className="font-medium tabular-nums text-[#0f172a] dark:text-zinc-100">
                  {overview.total_users ? `${Math.round((100 * overview.oauth_users) / overview.total_users)}%` : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
