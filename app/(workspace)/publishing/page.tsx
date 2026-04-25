"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublishingStatusBadge } from "@/components/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { platformLabel } from "@/lib/platform";
import type { PublishingPlatform } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function PublishingPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const publish = useWorkspaceStore((s) => s.publish);
  const runCron = useWorkspaceStore((s) => s.runCron);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const { push } = useToast();
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);
  const [lastPublishedCount, setLastPublishedCount] = useState(0);
  const [platformFilter, setPlatformFilter] = useState<"ALL" | PublishingPlatform>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Success" | "Failed">("ALL");
  const [search, setSearch] = useState("");
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const logs = useMemo(() => {
    if (!workspace) return [];
    return [...workspace.publishingLog].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [workspace]);
  const contentById = useMemo(() => {
    if (!workspace) return new Map();
    return new Map(workspace.content.map((item) => [item.id, item]));
  }, [workspace]);
  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((item) => {
      if (platformFilter !== "ALL" && item.platform !== platformFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!query) return true;
      const contentItem = contentById.get(item.contentId);
      const text = `${contentItem?.title ?? ""} ${contentItem?.contentText ?? ""} ${item.contentId} ${item.platform}`.toLowerCase();
      return text.includes(query);
    });
  }, [contentById, logs, platformFilter, search, statusFilter]);
  const activeLog = activeLogId ? filteredLogs.find((item) => item.id === activeLogId) ?? null : null;
  const activeContent = activeLog ? contentById.get(activeLog.contentId) : null;
  const content = workspace?.content ?? [];
  const pending = content.filter((c) => c.status === "PENDING");
  const approvedWithoutPlatform = content.filter((c) => c.status === "APPROVED" && !c.selectedPlatform);
  const scheduled = content.filter((c) => c.status === "SCHEDULED");
  const published = content.filter((c) => c.status === "PUBLISHED");
  const linkedinConnected = Boolean(workspace?.integrations.linkedin.connected);
  const metaConnected = Boolean(workspace?.integrations.meta.connected);
  const blocked = content.filter(
    (c) =>
      (c.status === "APPROVED" || c.status === "SCHEDULED") &&
      (!c.selectedPlatform || (c.selectedPlatform === "linkedin" ? !linkedinConnected : !metaConnected)),
  );
  const ready = content.filter(
    (c) =>
      (c.status === "APPROVED" || c.status === "SCHEDULED") &&
      c.selectedPlatform &&
      (c.selectedPlatform === "linkedin" ? linkedinConnected : metaConnected),
  );

  if (!workspace && loading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Publishing control center</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-xl" asChild>
              <Link href="/content">Open content</Link>
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" asChild>
              <Link href="/approval">Open approval queue</Link>
            </Button>
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void refreshWorkspace()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatTile label="Pending" value={pending.length} />
          <StatTile label="Approved w/o platform" value={approvedWithoutPlatform.length} />
          <StatTile label="Ready to publish" value={ready.length} />
          <StatTile label="Blocked" value={blocked.length} />
          <StatTile label="Scheduled" value={scheduled.length} />
          <StatTile label="Published" value={published.length} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Publish actions</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl"
              onClick={() => {
                void runCron().then((r) => {
                  setLastPublishedCount(r.published);
                  setLastWarnings(r.warnings);
                  push(`Cron cycle: ${r.published} auto-published`);
                });
              }}
            >
              Run cron cycle
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={ready.length === 0}
              onClick={() => {
                void publish(ready.map((c) => c.id)).then((r) => {
                  setLastPublishedCount(r.published);
                  setLastWarnings(r.warnings);
                  push(`Cycle complete: ${r.published} published`);
                });
              }}
            >
              Publish ready queue
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">Last cycle result: {lastPublishedCount} published.</p>
          {lastWarnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">Publish warnings</p>
              <div className="mt-2 space-y-1">
                {lastWarnings.slice(0, 6).map((warning) => (
                  <p key={warning} className="text-xs text-amber-800">
                    - {warning}
                  </p>
                ))}
              </div>
            </div>
          )}
          {ready.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-500">
              No publish-ready items. Approve content, choose platform, and connect integrations in Settings.
            </p>
          ) : (
            <div className="space-y-2">
              {ready.slice(0, 8).map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
                    <p className="text-xs text-zinc-500">{platformLabel(item.selectedPlatform as PublishingPlatform)}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => {
                      void publish([item.id]).then((r) => {
                        setLastPublishedCount(r.published);
                        setLastWarnings(r.warnings);
                        push(`Single publish: ${r.published} success`);
                      });
                    }}
                  >
                    Publish now
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Publishing log showcase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">All details shown: image/video preview, platform, status, publish time, schedule time, post id, and content text.</p>
          <div className="grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, text, or ID..." />
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as "ALL" | PublishingPlatform)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="ALL">All Platforms</option>
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="twitter">Twitter / X</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "Success" | "Failed")}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="ALL">All Status</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
            </select>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setSearch("");
                setPlatformFilter("ALL");
                setStatusFilter("ALL");
              }}
            >
              Clear filters
            </Button>
          </div>
          {logs.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500">
              No publishing activity yet. Publish a post to see it here.
            </p>
          )}
          {logs.length > 0 && filteredLogs.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-500">No logs match selected filters.</p>
          )}
          {filteredLogs.map((item) => {
            const contentItem = contentById.get(item.contentId);
            return (
              <div key={item.id} className="rounded-2xl border border-zinc-100 bg-zinc-50/60 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{contentItem?.title ?? "Content item"}</p>
                    <p className="text-xs text-zinc-500">
                      {platformLabel(item.platform as PublishingPlatform)} · {format(new Date(item.timestamp), "PPP p")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600 line-clamp-2">{contentItem?.contentText ?? "No content text available."}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Media: {contentItem?.mediaType ?? "—"} {contentItem?.scheduledAt ? `· Scheduled: ${format(new Date(contentItem.scheduledAt), "PPP p")}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">Post ID: {item.contentId || "—"}</p>
                  </div>
                  <PublishingStatusBadge status={item.status} />
                </div>
                {contentItem?.mediaPreview ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white p-1 transition hover:border-zinc-300"
                      onClick={() => setActiveLogId(item.id)}
                    >
                      {isVideoAsset(contentItem.mediaPreview) ? (
                        <video src={contentItem.mediaPreview} className="h-28 w-44 rounded-lg object-cover" muted playsInline />
                      ) : (
                        <img src={contentItem.mediaPreview} alt="" className="h-28 w-44 rounded-lg object-cover" />
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Dialog open={Boolean(activeLog)} onOpenChange={(open) => !open && setActiveLogId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Publishing log details</DialogTitle>
          </DialogHeader>
          {activeLog && activeContent && (
            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2">
                {isVideoAsset(activeContent.mediaPreview) ? (
                  <video src={activeContent.mediaPreview} controls className="max-h-[420px] w-full rounded-xl object-contain" />
                ) : (
                  <img src={activeContent.mediaPreview} alt="" className="max-h-[420px] w-full rounded-xl object-contain" />
                )}
              </div>
              <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
                <p className="font-semibold text-zinc-900">{activeContent.title}</p>
                <p className="text-zinc-600">{activeContent.contentText}</p>
                <p className="text-zinc-600">Platform: {platformLabel(activeLog.platform as PublishingPlatform)}</p>
                <p className="text-zinc-600">Status: {activeLog.status}</p>
                <p className="text-zinc-600">Published: {format(new Date(activeLog.timestamp), "PPP p")}</p>
                <p className="text-zinc-600">Scheduled: {activeContent.scheduledAt ? format(new Date(activeContent.scheduledAt), "PPP p") : "Not scheduled"}</p>
                <p className="text-zinc-600">Media: {activeContent.mediaType}</p>
                <p className="break-all text-zinc-500">Content ID: {activeLog.contentId}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isVideoAsset(src: string) {
  return src.startsWith("data:video/") || src.includes("/video/upload/") || /\.(mp4|mov|webm)(\?|$)/i.test(src);
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
