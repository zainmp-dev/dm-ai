"use client";

import Link from "next/link";
import { Inbox, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationEntry } from "@/components/notification-entry";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function NotificationsPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const pending = workspace ? workspace.content.filter((item) => item.status === "PENDING") : [];
  const pendingCount = pending.length;

  if (!workspace && loading) {
    return <Skeleton className="h-96 w-full max-w-3xl rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Notifications</h1>
        <p className="mt-1 text-sm text-zinc-500">Activity, approvals, and links to the right place in your workspace.</p>
      </div>

      {pendingCount > 0 && (
        <Link
          href="/content"
          className="flex items-start justify-between gap-4 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3.5 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-950">Approval required</p>
            <p className="mt-0.5 text-sm text-amber-900/90">
              {pendingCount} post{pendingCount === 1 ? "" : "s"} waiting for your review in Content.
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-950">Open</span>
        </Link>
      )}

      <Card className="overflow-hidden rounded-2xl border-zinc-200/80 shadow-sm">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600">
              <Inbox className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-zinc-900">Activity</CardTitle>
              <CardDescription className="text-sm text-zinc-500">Newest first. Click a row to open the related page.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {workspace.activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/30 py-14 text-center">
              <Sparkles className="size-8 text-zinc-300" aria-hidden />
              <p className="text-sm font-medium text-zinc-600">You are all caught up</p>
              <p className="max-w-sm text-xs text-zinc-500">New strategy runs, drafts, and publishes will show up here.</p>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="Notification list">
              {workspace.activities.map((item) => (
                <li key={item.id}>
                  <NotificationEntry text={item.text} createdAt={item.createdAt} variant="page" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
