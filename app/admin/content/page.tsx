"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAdminContentSummary, apiErrorMessage, type AdminContentSummaryResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (s === "PUBLISHED") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100";
  if (s === "SCHEDULED") return "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100";
  if (s === "PENDING") return "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100";
  if (s === "FAILED") return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200";
  return "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300";
}

export default function AdminContentSummaryPage() {
  const [data, setData] = useState<AdminContentSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiAdminContentSummary()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(apiErrorMessage(e) || "Unable to load summary.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxCount = useMemo(() => {
    const counts = data?.by_status.map((b) => b.count) ?? [];
    if (counts.length === 0) return 0;
    return Math.max(...counts);
  }, [data]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader>
          <CardTitle className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Pipeline overview</CardTitle>
          <CardDescription className="text-[13px] text-[#64748b] dark:text-zinc-500">
            Aggregate counts of content rows grouped by status (all workspaces).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : !data ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                <span className="text-[13px] font-medium text-[#64748b] dark:text-zinc-500">Total items</span>
                <span className="text-2xl font-semibold tabular-nums text-[#0f172a] dark:text-zinc-50">{data.total}</span>
              </div>
              <ul className="space-y-3">
                {data.by_status.map((row) => (
                  <li key={row.status} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:w-52">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusTone(row.status))}>
                        {row.status}
                      </span>
                      <span className="tabular-nums text-[13px] font-medium text-[#0f172a] dark:text-zinc-200">{row.count}</span>
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e5e7eb] dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-[#1a56db]/80 transition-[width]"
                        style={{ width: maxCount ? `${Math.max(8, (100 * row.count) / maxCount)}%` : "0%" }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {data.by_status.length === 0 ? (
                <p className="text-center text-sm text-[#64748b] dark:text-zinc-500">No content rows yet.</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
