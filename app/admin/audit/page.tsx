"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiAdminAuditEvents, apiErrorMessage } from "@/lib/api";

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(qInput.trim()), 320);
    return () => clearTimeout(t);
  }, [qInput]);

  const auditQ = useQuery({
    queryKey: ["admin", "audit", page, debouncedQ],
    queryFn: () => apiAdminAuditEvents({ page, page_size: 25, q: debouncedQ }),
  });

  const items = auditQ.data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="flex flex-col gap-3 border-b border-[#e5e7eb] pb-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="size-5 text-[#1a56db]" strokeWidth={1.75} />
            <CardTitle className="text-[15px]">Audit timeline</CardTitle>
          </div>
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" />
            <Input
              placeholder="Search actor, action, resource…"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border-[#e5e7eb] pl-9 dark:border-zinc-700"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {auditQ.isLoading ? (
            <div className="p-6">
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : auditQ.isError ? (
            <p className="p-6 text-[13px] text-red-600">{apiErrorMessage(auditQ.error)}</p>
          ) : (
            <>
              <div className="divide-y divide-[#f1f5f9] dark:divide-zinc-800">
                {items.map((ev) => (
                  <div key={ev.id} className="flex flex-col gap-1 px-6 py-4 text-[13px] sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-[#0f172a] dark:text-zinc-100">{ev.action}</p>
                      <p className="text-[12px] text-[#64748b] dark:text-zinc-500">
                        {ev.actor_email ?? ev.actor_id}
                        {ev.resource_type ? ` · ${ev.resource_type}` : ""}
                        {ev.resource_id ? ` · ${ev.resource_id}` : ""}
                      </p>
                      {Object.keys(ev.meta || {}).length ? (
                        <pre className="max-h-28 overflow-auto rounded-lg bg-[#f8fafc] p-2 font-mono text-[11px] text-[#475569] dark:bg-zinc-900 dark:text-zinc-400">
                          {JSON.stringify(ev.meta, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-[11px] tabular-nums text-[#94a3b8] dark:text-zinc-600">
                      {ev.created_at ? String(ev.created_at) : ""}
                    </div>
                  </div>
                ))}
              </div>
              {auditQ.data ? (
                <AdminPaginationBar
                  page={auditQ.data.page}
                  totalPages={auditQ.data.total_pages || 1}
                  total={auditQ.data.total}
                  pageSize={auditQ.data.page_size}
                  loading={auditQ.isFetching}
                  onPageChange={setPage}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
