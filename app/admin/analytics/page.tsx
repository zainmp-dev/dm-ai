"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAdminAnalyticsOverview, apiErrorMessage } from "@/lib/api";
import { useAdminOverviewOptional } from "@/components/admin/admin-shell";

export default function AdminAnalyticsPage() {
  const overview = useAdminOverviewOptional();
  const aq = useQuery({ queryKey: ["admin", "analytics"], queryFn: apiAdminAnalyticsOverview });

  const chartData =
    aq.data?.series.map((p, i) => ({
      name: p.label || `S${i + 1}`,
      value: p.value,
    })) ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <TrendingUp className="size-5 text-emerald-600" strokeWidth={1.75} />
              Accounts (total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-[#0f172a] dark:text-zinc-50">
              {overview?.total_users ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">New users (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {aq.isLoading ? (
              <Skeleton className="h-10 w-24 rounded-lg" />
            ) : aq.isError ? (
              <p className="text-[13px] text-red-600">{apiErrorMessage(aq.error)}</p>
            ) : (
              <p className="text-3xl font-semibold tabular-nums text-[#0f172a] dark:text-zinc-50">
                {aq.data?.dau_estimate ?? "—"}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px]">Workspaces</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-[#0f172a] dark:text-zinc-50">
              {overview?.workspace_rows ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader>
          <CardTitle className="text-[15px]">Signals</CardTitle>
          <p className="text-[13px] text-[#64748b] dark:text-zinc-500">
            Mix of live counts and placeholder indices — extend with warehouse pipelines when ready.
          </p>
        </CardHeader>
        <CardContent className="h-[280px]">
          {aq.isLoading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-[#e5e7eb] dark:stroke-zinc-800" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#1a56db" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
