"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, HardDrive, Plug2, Table2 } from "lucide-react";
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  apiAdminDbOverview,
  apiAdminDbTableRows,
  apiAdminDbTables,
  apiErrorMessage,
} from "@/lib/api";
import { formatBytes } from "@/lib/format-bytes";

export default function AdminDatabasePage() {
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [page, setPage] = useState(1);
  const [rowQ, setRowQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const overviewQ = useQuery({ queryKey: ["admin", "db", "overview"], queryFn: apiAdminDbOverview });
  const tablesQ = useQuery({ queryKey: ["admin", "db", "tables"], queryFn: apiAdminDbTables });

  const rowsQ = useQuery({
    queryKey: ["admin", "db", "rows", selectedTable, page, debouncedQ],
    queryFn: () =>
      apiAdminDbTableRows({ table: selectedTable, page, page_size: 25, q: debouncedQ }),
    enabled: Boolean(selectedTable),
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(rowQ.trim()), 320);
    return () => clearTimeout(t);
  }, [rowQ]);

  const tableNames = tablesQ.data?.tables ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Database className="size-5 text-[#1a56db]" strokeWidth={1.75} />
            <CardTitle className="text-[15px]">Postgres</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] text-[#475569] dark:text-zinc-400">
            {overviewQ.isLoading ? (
              <Skeleton className="h-16 w-full rounded-xl" />
            ) : overviewQ.isError ? (
              <p className="text-red-600 dark:text-red-400">{apiErrorMessage(overviewQ.error)}</p>
            ) : (
              <>
                <p className="line-clamp-3 font-mono text-[11px] leading-snug text-[#64748b] dark:text-zinc-500">
                  {overviewQ.data?.postgres_version ?? "Version unavailable"}
                </p>
                {overviewQ.data?.notes?.length ? (
                  <ul className="list-disc space-y-1 pl-4 text-[12px]">
                    {overviewQ.data.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <HardDrive className="size-5 text-emerald-600" strokeWidth={1.75} />
            <CardTitle className="text-[15px]">Storage</CardTitle>
          </CardHeader>
          <CardContent>
            {overviewQ.isLoading ? (
              <Skeleton className="h-10 w-full rounded-xl" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums text-[#0f172a] dark:text-zinc-50">
                {formatBytes(overviewQ.data?.database_bytes ?? null)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Plug2 className="size-5 text-amber-600" strokeWidth={1.75} />
            <CardTitle className="text-[15px]">Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {overviewQ.isLoading ? (
              <Skeleton className="h-10 w-full rounded-xl" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums text-[#0f172a] dark:text-zinc-50">
                {overviewQ.data?.active_connections ?? "—"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Table2 className="size-5 text-[#7c3aed]" strokeWidth={1.75} />
          <CardTitle className="text-[15px]">Tables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tablesQ.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : tablesQ.isError ? (
            <p className="text-[13px] text-red-600 dark:text-red-400">{apiErrorMessage(tablesQ.error)}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] dark:border-zinc-800">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                <thead className="border-b border-[#e5e7eb] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:border-zinc-800 dark:bg-zinc-900/40">
                  <tr>
                    <th className="px-4 py-2">Table</th>
                    <th className="px-4 py-2 text-right">Rows (est.)</th>
                    <th className="px-4 py-2 text-right">Size</th>
                    <th className="px-4 py-2 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9] dark:divide-zinc-800">
                  {tableNames.map((t) => (
                    <tr key={t.table_name} className="bg-white dark:bg-[#161618]">
                      <td className="px-4 py-2 font-mono text-[12px]">{t.table_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#475569] dark:text-zinc-400">
                        {t.row_estimate ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#475569] dark:text-zinc-400">
                        {formatBytes(t.total_bytes ?? null)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          className="text-[12px] font-medium text-[#1a56db] hover:underline"
                          onClick={() => {
                            setSelectedTable(t.table_name);
                            setPage(1);
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTable ? (
        <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
          <CardHeader className="flex flex-col gap-3 border-b border-[#e5e7eb] pb-4 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-[15px]">Rows · {selectedTable}</CardTitle>
              <p className="mt-1 text-[12px] text-[#64748b] dark:text-zinc-500">
                Read-only projection with ILIKE filters across visible columns.
              </p>
            </div>
            <Input
              placeholder="Filter rows…"
              value={rowQ}
              onChange={(e) => {
                setRowQ(e.target.value);
                setPage(1);
              }}
              className="h-10 max-w-xs rounded-xl border-[#e5e7eb] dark:border-zinc-700"
            />
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {rowsQ.isLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : rowsQ.isError ? (
              <p className="text-[13px] text-red-600 dark:text-red-400">{apiErrorMessage(rowsQ.error)}</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-[#e5e7eb] dark:border-zinc-800">
                  <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                    <thead className="border-b border-[#e5e7eb] bg-[#fafafa] dark:border-zinc-800 dark:bg-zinc-900/40">
                      <tr>
                        {rowsQ.data?.columns.map((c) => (
                          <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold text-[#64748b] dark:text-zinc-500">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9] dark:divide-zinc-800">
                      {(rowsQ.data?.rows ?? []).map((row, i) => (
                        <tr key={i} className="bg-white dark:bg-[#161618]">
                          {(rowsQ.data?.columns ?? []).map((c) => (
                            <td key={c} className="max-w-[280px] truncate px-3 py-2 font-mono text-[11px] text-[#475569] dark:text-zinc-400">
                              {formatCell(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rowsQ.data ? (
                  <AdminPaginationBar
                    page={rowsQ.data.page}
                    totalPages={Math.max(1, Math.ceil(rowsQ.data.total / rowsQ.data.page_size))}
                    total={rowsQ.data.total}
                    pageSize={rowsQ.data.page_size}
                    loading={rowsQ.isFetching}
                    onPageChange={setPage}
                  />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
