"use client";

import { endOfDay, startOfDay } from "date-fns";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Inbox,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationEntry } from "@/components/notification-entry";
import type { NotificationKind } from "@/lib/notification-routes";
import { resolveNotificationLink } from "@/lib/notification-routes";
import type { ActivityItem } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const KIND_OPTIONS: { value: NotificationKind | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "content", label: "Content" },
  { value: "strategy", label: "Strategy" },
  { value: "workspace", label: "Workspace" },
  { value: "media", label: "Media" },
  { value: "publishing", label: "Publishing" },
  { value: "scheduling", label: "Scheduling" },
  { value: "settings", label: "Settings" },
  { value: "general", label: "Other" },
];

function filterActivities(
  activities: ActivityItem[],
  query: string,
  kind: NotificationKind | "all",
  dateFrom: string,
  dateTo: string,
): ActivityItem[] {
  const q = query.trim().toLowerCase();
  const from = dateFrom ? startOfDay(new Date(dateFrom + "T12:00:00")) : null;
  const to = dateTo ? endOfDay(new Date(dateTo + "T12:00:00")) : null;

  return activities.filter((item) => {
    if (q && !item.text.toLowerCase().includes(q)) return false;
    if (kind !== "all") {
      const { kind: k } = resolveNotificationLink(item.text);
      if (k !== kind) return false;
    }
    const at = new Date(item.createdAt);
    if (from && at < from) return false;
    if (to && at > to) return false;
    return true;
  });
}

export default function NotificationsPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const pending = workspace ? workspace.content.filter((item) => item.status === "PENDING") : [];
  const pendingCount = pending.length;

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [kind, setKind] = useState<NotificationKind | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const activities = workspace?.activities;
  const sortedActivities = useMemo(() => {
    if (!activities?.length) return [];
    return [...activities].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [activities]);

  const filtered = useMemo(
    () => filterActivities(sortedActivities, deferredSearch, kind, dateFrom, dateTo),
    [sortedActivities, deferredSearch, kind, dateFrom, dateTo],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const hasFilters = Boolean(search.trim() || kind !== "all" || dateFrom || dateTo);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);

  function clearFilters() {
    setSearch("");
    setKind("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function goPrevPage() {
    const cur = Math.min(page, totalPages);
    setPage(Math.max(1, cur - 1));
  }

  function goNextPage() {
    const cur = Math.min(page, totalPages);
    setPage(Math.min(totalPages, cur + 1));
  }

  function bumpPageToOne() {
    setPage(1);
  }

  if (!workspace && loading) {
    return <Skeleton className="h-96 w-full min-w-0 rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Workspace unavailable.</p>;
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col">
      <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Notifications</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Newest first — {PAGE_SIZE} per page. Open a row to jump to the right screen.
          </p>
        </div>
        {sortedActivities.length > 0 && (
          <p className="shrink-0 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{filtered.length}</span>{" "}
            <span className="text-zinc-500">matching</span>
            <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
            <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{sortedActivities.length}</span>{" "}
            <span className="text-zinc-500">total</span>
          </p>
        )}
      </div>

      {pendingCount > 0 && (
        <Link
          href="/pipeline?tab=content"
          className="mb-4 flex min-w-0 items-start justify-between gap-4 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3.5 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40 dark:hover:border-amber-800/60 dark:hover:bg-amber-950/50"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-950 dark:text-amber-100">Approval required</p>
            <p className="mt-0.5 text-sm text-amber-900/90 dark:text-amber-200/90">
              {pendingCount} post{pendingCount === 1 ? "" : "s"} waiting in the Content + Approval workflow tab.
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-950 dark:bg-amber-900/80 dark:text-amber-100">
            Open
          </span>
        </Link>
      )}

      {sortedActivities.length > 0 && (
        <div
          className={cn(
            "sticky top-0 z-10 -mx-4 border-b border-zinc-200/90 bg-zinc-50/95 px-4 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95",
            "md:-mx-6 md:px-6",
          )}
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <Inbox className="size-3.5" aria-hidden />
            Activity
            <span className="font-normal text-zinc-400">— filter</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end lg:gap-3">
            <div className="relative sm:col-span-2 lg:col-span-4">
              <Label htmlFor="notif-search" className="sr-only">
                Search notifications
              </Label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                aria-hidden
              />
              <Input
                id="notif-search"
                type="search"
                placeholder="Search by keyword…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  bumpPageToOne();
                }}
                className="h-10 rounded-xl pl-10"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-1 lg:col-span-2">
              <Label htmlFor="notif-from" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                From
              </Label>
              <Input
                id="notif-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  bumpPageToOne();
                }}
                className="h-10 rounded-xl font-medium"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-1 lg:col-span-2">
              <Label htmlFor="notif-to" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                To
              </Label>
              <Input
                id="notif-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  bumpPageToOne();
                }}
                className="h-10 rounded-xl font-medium"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="notif-kind" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Type
              </Label>
              <select
                id="notif-kind"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as NotificationKind | "all");
                  bumpPageToOne();
                }}
                className={cn(
                  "h-10 w-full cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 outline-none",
                  "focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500",
                )}
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <div className="flex items-end sm:col-span-2 lg:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 w-full gap-1.5 rounded-xl border-dashed"
                  onClick={clearFilters}
                >
                  <X className="size-3.5" />
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 min-w-0 flex-1 rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900/20">
        {sortedActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center sm:px-6">
            <Sparkles className="size-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">You are all caught up</p>
            <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
              New strategy runs, drafts, and publishes will show up here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center sm:px-6">
            <div className="flex size-10 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
              <Filter className="size-5 text-zinc-400" aria-hidden />
            </div>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">No notifications match your filters</p>
            <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">Try a wider date range or clear the search.</p>
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={clearFilters}>
              Reset filters
            </Button>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800" aria-label="Notification list">
              {pageSlice.map((item) => (
                <li key={item.id} className="p-3 sm:p-4">
                  <NotificationEntry text={item.text} createdAt={item.createdAt} variant="page" />
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 border-t border-zinc-100 bg-zinc-50/50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/30 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 sm:text-left">
                Showing{" "}
                <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{rangeStart}</span>–
                <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{rangeEnd}</span> of{" "}
                <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{filtered.length}</span>
                <span className="ml-1.5 text-zinc-400">· {PAGE_SIZE} per page</span>
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-0.5 rounded-lg px-2"
                  disabled={safePage <= 1}
                  onClick={() => setPage(1)}
                  aria-label="First page"
                  title="First page"
                >
                  <ChevronsLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-0.5 rounded-lg px-2.5"
                  disabled={safePage <= 1}
                  onClick={goPrevPage}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                  <span className="hidden sm:inline">Prev</span>
                </Button>
                <span className="min-w-[6.5rem] px-1 text-center text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
                  Page {safePage} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-0.5 rounded-lg px-2.5"
                  disabled={safePage >= totalPages}
                  onClick={goNextPage}
                  aria-label="Next page"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-0.5 rounded-lg px-2"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  aria-label="Last page"
                  title="Last page"
                >
                  <ChevronsRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
