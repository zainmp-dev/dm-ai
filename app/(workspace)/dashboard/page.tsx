"use client";

import { format, parseISO } from "date-fns";
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FileStack, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/workspace-store";

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

function inferActivityStatus(text: string): { label: string; className: string } {
  const lower = text.toLowerCase();
  if (/\b(error|failed|failure|exception|denied|timed out|timeout|402|403|500)\b/i.test(text)) {
    return {
      label: "Error",
      className:
        "bg-red-500/[0.09] text-red-900 ring-1 ring-red-500/15 dark:bg-red-500/12 dark:text-red-100 dark:ring-red-400/20",
    };
  }
  if (/gap issue|marketing gap|pain point|warning|caution/i.test(lower)) {
    return {
      label: "Insight",
      className:
        "bg-amber-500/[0.12] text-amber-950 ring-1 ring-amber-500/18 dark:bg-amber-400/14 dark:text-amber-50 dark:ring-amber-400/22",
    };
  }
  if (
    /\b(added|completed|finished|saved|updated|published|scheduled|approved|synced|cleared|removed|deleted|success)\b/i.test(
      lower,
    )
  ) {
    return {
      label: "Success",
      className:
        "bg-emerald-500/[0.11] text-emerald-950 ring-1 ring-emerald-500/16 dark:bg-emerald-500/14 dark:text-emerald-50 dark:ring-emerald-400/22",
    };
  }
  return {
    label: "Activity",
    className:
      "bg-zinc-500/[0.08] text-zinc-800 ring-1 ring-zinc-500/12 dark:bg-zinc-400/10 dark:text-zinc-100 dark:ring-zinc-400/15",
  };
}

export default function DashboardPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const [activityQuery, setActivityQuery] = useState("");
  const [activityPage, setActivityPage] = useState(0);

  const activityRows = workspace?.activities ?? [];

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
    setActivityPage((p) => Math.min(p, Math.max(0, activityPageCount - 1)));
  }, [activityPageCount, filteredActivities.length]);

  useEffect(() => {
    setActivityPage(0);
  }, [activityQuery]);

  if (!workspace && loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[7.25rem] rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-[14px]" />
      </div>
    );
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  const metrics = [
    {
      label: "Total Content",
      value: workspace.content.length,
      icon: FileStack,
      href: "/pipeline?tab=content",
    },
    {
      label: "Pending approvals",
      value: workspace.content.filter((item) => item.status === "PENDING").length,
      icon: Timer,
      href: "/pipeline?tab=content",
    },
    {
      label: "Published posts",
      value: workspace.content.filter((item) => item.status === "PUBLISHED").length,
      icon: CheckCircle2,
      href: "/pipeline?tab=publishing",
    },
    {
      label: "Scheduled posts",
      value: workspace.content.filter((item) => item.status === "SCHEDULED").length,
      icon: CalendarClock,
      href: "/pipeline?tab=scheduling",
    },
  ];

  const chartTooltipStyle = {
    borderRadius: 12,
    border: "1px solid rgb(228 228 231)",
    boxShadow: "0 8px 28px -8px rgba(15, 23, 42, 0.15)",
    padding: "10px 14px",
    fontSize: 12,
  } as const;

  return (
    <div className="space-y-8">
      {!workspace.workspaceConfigured && (
        <Card className="rounded-[14px] border-amber-200/80 bg-amber-50/40 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-amber-900/50 dark:bg-amber-950/25">
          <CardHeader>
            <CardTitle className="text-base text-amber-900">Complete workspace setup</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-800">Set your company and scenario to load realistic operational data.</p>
            <Button asChild size="sm" className="rounded-xl">
              <Link href="/workspace-setup">Open setup</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="group block rounded-[14px] outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f6f9] dark:focus-visible:ring-offset-zinc-950"
              aria-label={`Open ${metric.label} in Workflow`}
            >
              <Card className="h-full cursor-pointer rounded-[14px] border-zinc-200/90 transition-[box-shadow,border-color] duration-200 group-hover:border-zinc-300/90 group-hover:shadow-[0_4px_28px_-12px_rgba(15,23,42,0.14)] dark:border-zinc-800/90 dark:group-hover:border-zinc-700">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <CardTitle className="text-[13px] font-medium leading-snug text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-300">
                    {metric.label}
                  </CardTitle>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/[0.08] text-blue-600 ring-1 ring-blue-500/10 transition-colors duration-200 group-hover:bg-blue-500/12 dark:bg-blue-500/12 dark:text-blue-300 dark:ring-blue-400/15">
                    <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                  </span>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{metric.value}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[14px] border-zinc-200/90 dark:border-zinc-800/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Content performance</CardTitle>
          </CardHeader>
          <CardContent className="h-80 pt-2">
            <div className="dashboard-chart-reveal h-full w-full min-h-[16rem]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={workspace.engagementSeries} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgb(161 161 170)" strokeOpacity={0.22} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="rgb(113 113 122)" fontSize={11} tickMargin={10} dy={4} />
                  <YAxis tickLine={false} axisLine={false} stroke="rgb(113 113 122)" fontSize={11} width={36} tickMargin={8} />
                  <Tooltip
                    cursor={{ stroke: "rgba(37, 99, 235, 0.12)", strokeWidth: 1 }}
                    contentStyle={{
                      ...chartTooltipStyle,
                      background: "rgb(255 255 255)",
                      color: "rgb(24 24 27)",
                    }}
                  />
                  <Line
                    type="natural"
                    dataKey="engagement"
                    stroke="#2563eb"
                    strokeWidth={2.25}
                    dot={{ r: 3.5, fill: "#fff", strokeWidth: 2, stroke: "#2563eb" }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: "#1d4ed8" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[14px] border-zinc-200/90 dark:border-zinc-800/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Lead growth</CardTitle>
          </CardHeader>
          <CardContent className="h-80 pt-2">
            <div className="dashboard-chart-reveal h-full w-full min-h-[16rem]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workspace.leadsGrowth} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgb(161 161 170)" strokeOpacity={0.22} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="rgb(113 113 122)" fontSize={11} tickMargin={10} dy={4} />
                  <YAxis tickLine={false} axisLine={false} stroke="rgb(113 113 122)" fontSize={11} width={36} tickMargin={8} />
                  <Tooltip
                    cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                    contentStyle={{
                      ...chartTooltipStyle,
                      background: "rgb(255 255 255)",
                      color: "rgb(24 24 27)",
                    }}
                  />
                  <Bar
                    dataKey="leads"
                    fill="#2563eb"
                    fillOpacity={0.88}
                    radius={[7, 7, 0, 0]}
                    maxBarSize={48}
                    activeBar={{ fill: "#1d4ed8", fillOpacity: 1 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[14px] border-zinc-200/90 dark:border-zinc-800/90">
        <CardHeader className="space-y-4 pb-2">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Activity feed</CardTitle>
            {activityRows.length > 0 ? (
              <p className="text-xs tabular-nums text-zinc-500">
                {filteredActivities.length} of {activityRows.length} shown
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-feed-search" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Search activity
            </Label>
            <Input
              id="activity-feed-search"
              value={activityQuery}
              onChange={(e) => setActivityQuery(e.target.value)}
              placeholder="Filter by keyword…"
              className="h-10 rounded-xl border-zinc-200/90 bg-white shadow-none transition-[border-color,box-shadow] duration-200 focus-visible:border-blue-400/70 focus-visible:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950/50"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {activityRows.length === 0 && <p className="text-sm text-zinc-500">No recent activity.</p>}
          {activityRows.length > 0 && filteredActivities.length === 0 && (
            <p className="text-sm text-zinc-500">No matches for that search.</p>
          )}
          {activitySlice.map((activity) => {
            const status = inferActivityStatus(activity.text);
            return (
              <div
                key={activity.id}
                className="group flex flex-col gap-2.5 rounded-[12px] border border-zinc-200/50 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-[border-color,box-shadow] duration-200 hover:border-zinc-300/70 hover:shadow-[0_6px_24px_-12px_rgba(15,23,42,0.1)] dark:border-zinc-800/70 dark:bg-zinc-900/35 dark:hover:border-zinc-600/80"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Badge className={cn("shrink-0 px-2.5 py-1 text-[11px] font-semibold", status.className)}>{status.label}</Badge>
                  <time className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500" dateTime={activity.createdAt}>
                    {formatActivityTimestamp(activity.createdAt)}
                  </time>
                </div>
                <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">{activity.text}</p>
              </div>
            );
          })}
          {filteredActivities.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/60 pt-4 dark:border-zinc-800/80">
              <p className="text-[11px] tabular-nums text-zinc-500">
                Showing {safeActivityPage * ACTIVITY_FEED_PAGE_SIZE + 1}–
                {Math.min((safeActivityPage + 1) * ACTIVITY_FEED_PAGE_SIZE, filteredActivities.length)} of{" "}
                {filteredActivities.length}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-0.5 rounded-lg px-2"
                  disabled={safeActivityPage <= 0}
                  onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Button>
                <span className="min-w-[5.25rem] text-center tabular-nums text-xs text-zinc-600 dark:text-zinc-400">
                  Page {safeActivityPage + 1} / {activityPageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-0.5 rounded-lg px-2"
                  disabled={safeActivityPage >= activityPageCount - 1}
                  onClick={() => setActivityPage((p) => Math.min(activityPageCount - 1, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
