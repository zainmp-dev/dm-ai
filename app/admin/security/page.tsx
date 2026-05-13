"use client";

import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAdminRbacMatrix, apiErrorMessage } from "@/lib/api";

export default function AdminSecurityPage() {
  const q = useQuery({ queryKey: ["admin", "rbac"], queryFn: apiAdminRbacMatrix });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="flex flex-row items-center gap-2">
          <Shield className="size-5 text-emerald-600" strokeWidth={1.75} />
          <CardTitle className="text-[15px]">Permission matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {q.isLoading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : q.isError ? (
            <p className="text-[13px] text-red-600">{apiErrorMessage(q.error)}</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] dark:border-zinc-800">
                <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
                  <thead className="border-b border-[#e5e7eb] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:border-zinc-800 dark:bg-zinc-900/40">
                    <tr>
                      <th className="px-4 py-2">Role</th>
                      <th className="px-4 py-2">Label</th>
                      <th className="px-4 py-2">Assignable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9] dark:divide-zinc-800">
                    {(q.data?.roles ?? []).map((r) => (
                      <tr key={r.role_id} className="bg-white dark:bg-[#161618]">
                        <td className="px-4 py-2 font-mono text-[12px]">{r.role_id}</td>
                        <td className="px-4 py-2">{r.label}</td>
                        <td className="px-4 py-2">{r.assignable ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-zinc-500">
                  Fine-grained permissions
                </p>
                <div className="flex flex-wrap gap-2">
                  {(q.data?.permissions ?? []).map((p) => (
                    <span
                      key={p}
                      className="rounded-full bg-[#f1f5f9] px-2.5 py-1 font-mono text-[11px] text-[#475569] dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
