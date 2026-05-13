"use client";

import { useQuery } from "@tanstack/react-query";
import { Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAdminAiSummary, apiErrorMessage } from "@/lib/api";

export default function AdminAiPage() {
  const q = useQuery({ queryKey: ["admin", "ai"], queryFn: apiAdminAiSummary });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="flex flex-row items-center gap-2">
          <Brain className="size-5 text-violet-600" strokeWidth={1.75} />
          <CardTitle className="text-[15px]">AI readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-[13px] text-[#475569] dark:text-zinc-400">
          {q.isLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : q.isError ? (
            <p className="text-red-600 dark:text-red-400">{apiErrorMessage(q.error)}</p>
          ) : (
            <>
              <p>
                OpenRouter key configured:{" "}
                <strong className={q.data?.openrouter_configured ? "text-emerald-600" : "text-amber-600"}>
                  {q.data?.openrouter_configured ? "yes" : "no"}
                </strong>
              </p>
              {q.data?.notes?.length ? (
                <ul className="list-disc space-y-1 pl-4">
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
