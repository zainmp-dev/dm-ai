"use client";

import { useQuery } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAdminOpsOverview, apiErrorMessage } from "@/lib/api";

export default function AdminOperationsPage() {
  const q = useQuery({ queryKey: ["admin", "ops"], queryFn: apiAdminOpsOverview });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="flex flex-row items-center gap-2">
          <Cpu className="size-5 text-[#1a56db]" strokeWidth={1.75} />
          <CardTitle className="text-[15px]">Integration jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-[13px]">
          {q.isLoading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : q.isError ? (
            <p className="text-red-600 dark:text-red-400">{apiErrorMessage(q.error)}</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-500">
                    Pending
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{q.data?.integration_jobs_pending ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-500">
                    Failed
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {q.data?.integration_jobs_failed ?? "—"}
                  </p>
                </div>
              </div>
              {q.data?.notes?.length ? (
                <ul className="list-disc space-y-1 pl-4 text-[#475569] dark:text-zinc-400">
                  {q.data.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
