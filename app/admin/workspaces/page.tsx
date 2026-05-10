"use client";

import { format, parseISO } from "date-fns";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiAdminWorkspaces, apiErrorMessage, type AdminWorkspacesPageResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

export default function AdminWorkspacesPage() {
  const [pack, setPack] = useState<AdminWorkspacesPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [queryInput, setQueryInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [configured, setConfigured] = useState<"all" | "yes" | "no">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(queryInput.trim()), 320);
    return () => clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, configured, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiAdminWorkspaces({ page, page_size: pageSize, q: debouncedQ, configured })
      .then((data) => {
        if (!cancelled) setPack(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(apiErrorMessage(e) || "Unable to load workspaces.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, debouncedQ, configured]);

  const rows = pack?.items ?? [];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <Card className="rounded-2xl border-[#e5e7eb] bg-white dark:border-zinc-800 dark:bg-[#161618]">
        <CardHeader className="space-y-4 pb-4">
          <div>
            <CardTitle className="text-[15px] font-semibold text-[#0f172a] dark:text-zinc-50">Workspace catalog</CardTitle>
            <CardDescription className="text-[13px] text-[#64748b] dark:text-zinc-500">
              One row per tenant workspace (workspace ID equals the owner user ID).
            </CardDescription>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="relative max-w-md flex-1">
              <Label htmlFor="admin-ws-q" className="sr-only">
                Search workspaces
              </Label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                id="admin-ws-q"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search workspace ID, owner, company, website…"
                className="h-10 rounded-xl border-[#e5e7eb] bg-[#fafafa] pl-9 dark:border-zinc-700 dark:bg-zinc-900/60"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">
                  Rows
                </Label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8] dark:text-zinc-500">Setup gate</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "all" as const, label: "All workspaces" },
                  { id: "yes" as const, label: "Configured" },
                  { id: "no" as const, label: "Not configured" },
                ]
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setConfigured(pill.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                    configured === pill.id
                      ? "bg-[#1a56db] text-white shadow-sm"
                      : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {error ? (
            <p className="border-t border-[#f1f5f9] px-6 py-8 text-center text-sm text-red-600 dark:border-zinc-800 dark:text-red-400">
              {error}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto border-t border-[#f1f5f9] dark:border-zinc-800">
                <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500">
                      <th className="whitespace-nowrap px-4 py-3 pl-6">Workspace</th>
                      <th className="whitespace-nowrap px-4 py-3">Owner</th>
                      <th className="whitespace-nowrap px-4 py-3">Company</th>
                      <th className="whitespace-nowrap px-4 py-3">Scenario / region</th>
                      <th className="whitespace-nowrap px-4 py-3">Setup</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">Library</th>
                      <th className="whitespace-nowrap px-4 py-3 pr-6 text-right">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9] dark:divide-zinc-800">
                    {loading && rows.length === 0
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="animate-pulse bg-white dark:bg-[#161618]">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="h-10 rounded-lg bg-[#f1f5f9] dark:bg-zinc-800" />
                            </td>
                          </tr>
                        ))
                      : rows.map((row) => (
                          <tr
                            key={row.workspace_id}
                            className="bg-white transition-colors hover:bg-[#fafafa] dark:bg-[#161618] dark:hover:bg-zinc-900/50"
                          >
                            <td className="max-w-[200px] px-4 py-3 pl-6 align-top font-mono text-[11px] text-[#475569] dark:text-zinc-400">
                              {row.workspace_id}
                            </td>
                            <td className="max-w-[180px] px-4 py-3 align-top">
                              <p className="truncate font-medium text-[#0f172a] dark:text-zinc-100">{row.owner_name || "—"}</p>
                              <p className="truncate text-[12px] text-[#64748b] dark:text-zinc-500">{row.owner_email}</p>
                            </td>
                            <td className="max-w-[200px] px-4 py-3 align-top">
                              <p className="truncate font-medium text-[#0f172a] dark:text-zinc-100">{row.company_name || "—"}</p>
                              {row.company_website ? (
                                <p className="truncate text-[12px] text-[#64748b] dark:text-zinc-500">{row.company_website}</p>
                              ) : null}
                            </td>
                            <td className="max-w-[160px] px-4 py-3 align-top">
                              <p className="truncate">{row.workspace_scenario}</p>
                              <p className="truncate text-[12px] text-[#64748b] dark:text-zinc-500">{row.primary_region}</p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 align-top">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  row.workspace_configured
                                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                                    : "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
                                )}
                              >
                                {row.workspace_configured ? "Ready" : "Incomplete"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 align-top text-right tabular-nums text-[#475569] dark:text-zinc-400">
                              {row.content_count} content
                              <span className="block text-[11px] text-[#94a3b8] dark:text-zinc-600">{row.competitor_count} competitors</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 pr-6 align-top text-right text-[#64748b] dark:text-zinc-500">
                              {formatDt(row.updated_at)}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
              {pack ? (
                <AdminPaginationBar
                  page={pack.page}
                  totalPages={pack.total_pages}
                  total={pack.total}
                  pageSize={pack.page_size}
                  loading={loading}
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
