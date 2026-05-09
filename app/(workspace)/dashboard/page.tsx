"use client";

import { format, parseISO } from "date-fns";
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FileStack, Timer } from "lucide-react";
import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";

const ACTIVITY_FEED_PAGE_SIZE = 8;

function formatActivityTimestamp(iso: string): string {
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return format(d, "MMM d, yyyy · h:mm a");
  } catch {
    return iso;
  }
}

function inferActivityStatus(text: string): { label: string; color: string } {
  if (/\b(error|failed|failure|exception|denied|timed out|timeout|402|403|500)\b/i.test(text)) {
    return { label: "Error", color: "bg-red-50 text-red-700 ring-1 ring-red-200" };
  }
  if (/gap issue|marketing gap|pain point|warning|caution/i.test(text.toLowerCase())) {
    return { label: "Insight", color: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" };
  }
  if (
    /\b(added|completed|finished|saved|updated|published|scheduled|approved|synced|cleared|removed|deleted|success)\b/i.test(text.toLowerCase())
  ) {
    return { label: "Success", color: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
  }
  return { label: "Activity", color: "bg-[#f0f4ff] text-[#1a56db] ring-1 ring-blue-100" };
}

export default function DashboardPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const [activityQuery, setActivityQuery] = useState("");
  const [activityPage, setActivityPage] = useState(0);

  const activityRows = useMemo(() => workspace?.activities ?? [], [workspace?.activities]);

  const filteredActivities = useMemo(() => {
    const q = activityQuery.trim().toLowerCase();
    if (!q) return activityRows;
    return activityRows.filter((a) => a.text.toLowerCase().includes(q));
  }, [activityRows, activityQuery]);

  const activityPageCount = Math.max(1, Math.ceil(filteredActivities.length / ACTIVITY_FEED_PAGE_SIZE) || 1);
  const safeActivityPage = Math.min(activityPage, Math.max(0, activityPageCount - 1));

  const activitySlice = useMemo(
    () =>
      filteredActivities.slice(
        safeActivityPage * ACTIVITY_FEED_PAGE_SIZE,
        safeActivityPage * ACTIVITY_FEED_PAGE_SIZE + ACTIVITY_FEED_PAGE_SIZE,
      ),
    [filteredActivities, safeActivityPage],
  );

  useEffect(() => {
    startTransition(() => setActivityPage(0));
  }, [activityQuery]);

  if (shellPending) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!workspace) {
    return <p className="text-sm text-[#6b7280]">Workspace unavailable.</p>;
  }

  const metrics = [
    {
      label: "Total Content",
      value: workspace.content.length,
      icon: FileStack,
      href: "/pipeline?tab=content",
      accent: "#1a56db",
      bg: "#f0f4ff",
    },
    {
      label: "Pending Approvals",
      value: workspace.content.filter((item) => item.status === "PENDING").length,
      icon: Timer,
      href: "/pipeline?tab=content",
      accent: "#b45309",
      bg: "#fffbeb",
    },
    {
      label: "Published Posts",
      value: workspace.content.filter((item) => item.status === "PUBLISHED").length,
      icon: CheckCircle2,
      href: "/pipeline?tab=publishing",
      accent: "#047857",
      bg: "#ecfdf5",
    },
    {
      label: "Scheduled Posts",
      value: workspace.content.filter((item) => item.status === "SCHEDULED").length,
      icon: CalendarClock,
      href: "/pipeline?tab=scheduling",
      accent: "#7c3aed",
      bg: "#f5f3ff",
    },
  ];

  const tooltipStyle = {
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 16px -4px rgba(0,0,0,0.1)",
    padding: "8px 12px",
    fontSize: 12,
    background: "#ffffff",
    color: "#111827",
  } as const;

  return (
    <div className="space-y-6">
      {!workspace.workspaceConfigured && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-[13.5px] font-semibold text-amber-900">Complete workspace setup</p>
            <p className="mt-0.5 text-[12.5px] text-amber-800">
              Set your company and scenario to load realistic operational data.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700">
            <Link href="/workspace-setup">Open setup</Link>
          </Button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="group block rounded-xl border border-[#e5e7eb] bg-white px-5 py-4 transition-shadow hover:shadow-sm"
              aria-label={`Open ${metric.label}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[12.5px] font-medium text-[#6b7280]">{metric.label}</p>
                  <p
                    className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight"
                    style={{ color: metric.accent }}
                  >
                    {metric.value}
                  </p>
                </div>
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: metric.bg }}
                >
                  <Icon className="size-[17px]" strokeWidth={1.7} style={{ color: metric.accent }} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[#e5e7eb] bg-white px-5 pt-4 pb-5">
          <p className="text-[13.5px] font-semibold text-[#111827]">Content performance</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={workspace.engagementSeries} margin={{ top: 6, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="#9ca3af" fontSize={11} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} stroke="#9ca3af" fontSize={11} width={34} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(26,86,219,0.1)", strokeWidth: 1 }} />
                <Line
                  type="natural"
                  dataKey="engagement"
                  stroke="#1a56db"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#fff", strokeWidth: 2, stroke: "#1a56db" }}
                  activeDot={{ r: 4.5, strokeWidth: 0, fill: "#1a56db" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-white px-5 pt-4 pb-5">
          <p className="text-[13.5px] font-semibold text-[#111827]">Lead growth</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workspace.leadsGrowth} margin={{ top: 6, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="#9ca3af" fontSize={11} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} stroke="#9ca3af" fontSize={11} width={34} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(26,86,219,0.05)" }} />
                <Bar dataKey="leads" fill="#1a56db" fillOpacity={0.85} radius={[5, 5, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-xl border border-[#e5e7eb] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e5e7eb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13.5px] font-semibold text-[#111827]">Activity feed</p>
            {activityRows.length > 0 && (
              <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                {filteredActivities.length} of {activityRows.length} entries
              </p>
            )}
          </div>
          <Input
            value={activityQuery}
            onChange={(e) => setActivityQuery(e.target.value)}
            placeholder="Search activity…"
            className="h-8 w-full rounded-lg border-[#e5e7eb] text-[12.5px] shadow-none sm:w-52"
          />
        </div>

        {/* Empty states */}
        {activityRows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-[#9ca3af]">No recent activity.</p>
        )}
        {activityRows.length > 0 && filteredActivities.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-[#9ca3af]">No matches for that search.</p>
        )}

        {/* Table-style rows */}
        {activitySlice.length > 0 && (
          <div className="divide-y divide-[#f3f4f6]">
            {activitySlice.map((activity) => {
              const status = inferActivityStatus(activity.text);
              return (
                <div
                  key={activity.id}
                  className="flex flex-col gap-1.5 px-5 py-3.5 transition-colors hover:bg-[#fafafa] sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="flex shrink-0 items-center gap-3 sm:w-36">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                        status.color,
                      )}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p className="flex-1 text-[13px] leading-relaxed text-[#374151]">{activity.text}</p>
                  <time
                    className="shrink-0 text-[11.5px] tabular-nums text-[#9ca3af] sm:text-right"
                    dateTime={activity.createdAt}
                  >
                    {formatActivityTimestamp(activity.createdAt)}
                  </time>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {filteredActivities.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] px-5 py-3">
            <p className="text-[12px] text-[#9ca3af]">
              {safeActivityPage * ACTIVITY_FEED_PAGE_SIZE + 1}–
              {Math.min((safeActivityPage + 1) * ACTIVITY_FEED_PAGE_SIZE, filteredActivities.length)} of{" "}
              {filteredActivities.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:bg-[#f5f7fa] disabled:opacity-40"
                disabled={safeActivityPage <= 0}
                onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="min-w-[4.5rem] text-center text-[12px] tabular-nums text-[#6b7280]">
                {safeActivityPage + 1} / {activityPageCount}
              </span>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:bg-[#f5f7fa] disabled:opacity-40"
                disabled={safeActivityPage >= activityPageCount - 1}
                onClick={() => setActivityPage((p) => Math.min(activityPageCount - 1, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
