"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function DashboardPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);

  if (!workspace && loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  const metrics = [
    { label: "Total Content", value: workspace.content.length },
    { label: "Pending approvals", value: workspace.content.filter((item) => item.status === "PENDING").length },
    { label: "Published posts", value: workspace.content.filter((item) => item.status === "PUBLISHED").length },
    { label: "Scheduled posts", value: workspace.content.filter((item) => item.status === "SCHEDULED").length },
  ];

  return (
    <div className="space-y-6">
      {!workspace.workspaceConfigured && (
        <Card className="rounded-2xl border-amber-200 bg-amber-50/50">
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="rounded-2xl border-zinc-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">{metric.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight text-zinc-900">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Content performance</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={workspace.engagementSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="engagement" stroke="#18181b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Lead growth</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workspace.leadsGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip />
                <Bar dataKey="leads" fill="#3f3f46" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Activity feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workspace.activities.length === 0 && <p className="text-sm text-zinc-500">No recent activity.</p>}
          {workspace.activities.slice(0, 12).map((activity) => (
            <div key={activity.id} className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4 transition hover:border-zinc-200">
              <p className="text-sm text-zinc-800">{activity.text}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
