"use client";

import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function NotificationsPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);

  if (!workspace && loading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <Card className="rounded-2xl border-zinc-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {workspace.content.filter((item) => item.status === "PENDING").length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {workspace.content.filter((item) => item.status === "PENDING").length} post(s) are pending approval.
          </div>
        )}
        {workspace.activities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500">You are all caught up.</div>
        ) : (
          workspace.activities.map((item) => (
            <div key={item.id} className="flex gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="mt-0.5 size-2 shrink-0 rounded-full bg-zinc-900" />
              <div>
                <p className="text-sm text-zinc-800">{item.text}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
