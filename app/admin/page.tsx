"use client";

import { format } from "date-fns";
import { Building2, CheckCircle2, KeyRound, Layers, Shield, Users } from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminOverviewOptional } from "@/components/admin/admin-shell";

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: typeof Users;
  accent: string;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border-[#e5e7eb] bg-white shadow-sm dark:border-zinc-800 dark:bg-[#161618]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-wide text-[#64748b] dark:text-zinc-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[#0f172a] dark:text-zinc-50">{value}</p>
            {hint ? <p className="mt-1.5 text-[12px] leading-snug text-[#64748b] dark:text-zinc-500">{hint}</p> : null}
          </div>
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const overview = useAdminOverviewOptional();

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

  if (!overview) {
    return null;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] text-[#64748b] dark:text-zinc-500">
            Snapshot reflects live database counts — refreshed when you open the console.
          </p>
          <p className="mt-1 text-[11px] text-[#94a3b8] dark:text-zinc-600">Last loaded · {generatedAt}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered accounts"
          value={overview.total_users}
          hint={`${overview.admin_count} admin · ${overview.total_users - overview.admin_count} standard`}
          icon={Users}
          accent="#1a56db"
        />
        <StatCard
          label="Workspace records"
          value={overview.workspace_rows}
          hint={
            pct != null
              ? `${overview.configured_workspaces} fully configured (${pct}% of rows)`
              : `${overview.configured_workspaces} fully configured`
          }
          icon={Building2}
          accent="#059669"
        />
        <StatCard
          label="Sign-in methods"
          value={`${overview.oauth_users} / ${overview.password_only_users}`}
          hint="OAuth linked · Email & password only"
          icon={KeyRound}
          accent="#7c3aed"
        />
        <StatCard
          label="Content items"
          value={overview.total_content_items}
          hint="Across all user workspaces"
          icon={Layers}
          accent="#d97706"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618] lg:col-span-2">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-[#1a56db]" strokeWidth={1.75} />
              <h2 className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Operational notes</h2>
            </div>
            <ul className="space-y-3 text-[13px] leading-relaxed text-[#475569] dark:text-zinc-400">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Use <strong className="font-medium text-[#0f172a] dark:text-zinc-200">Users & setup</strong> to audit who
                  finished onboarding, which scenario they chose, and how much content exists per tenant.
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Admin accounts bypass the workspace wizard by design — they operate this console instead of a marketing
                  workspace.
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Use{" "}
                  <code className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 text-[11px] dark:bg-zinc-800">
                    backend/promote_admin.py
                  </code>{" "}
                  when the UI is unreachable. Otherwise manage credentials under{" "}
                  <strong className="font-medium text-[#0f172a] dark:text-zinc-200">Users & setup</strong>.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardContent className="space-y-4 p-6">
            <h2 className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Quick ratios</h2>
            <dl className="space-y-3 text-[13px]">
              <div className="flex justify-between gap-2 border-b border-dashed border-[#e5e7eb] pb-3 dark:border-zinc-800">
                <dt className="text-[#64748b] dark:text-zinc-500">Workspaces per user</dt>
                <dd className="font-medium tabular-nums text-[#0f172a] dark:text-zinc-100">
                  {overview.total_users ? (overview.workspace_rows / overview.total_users).toFixed(2) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-dashed border-[#e5e7eb] pb-3 dark:border-zinc-800">
                <dt className="text-[#64748b] dark:text-zinc-500">Avg content / workspace</dt>
                <dd className="font-medium tabular-nums text-[#0f172a] dark:text-zinc-100">
                  {overview.workspace_rows ? (overview.total_content_items / overview.workspace_rows).toFixed(1) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#64748b] dark:text-zinc-500">OAuth adoption</dt>
                <dd className="font-medium tabular-nums text-[#0f172a] dark:text-zinc-100">
                  {overview.total_users
                    ? `${Math.round((100 * overview.oauth_users) / overview.total_users)}%`
                    : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
