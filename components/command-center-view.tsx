"use client";

import { addDays, format, startOfWeek } from "date-fns";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FacebookPostPreview } from "@/components/previews/facebook-post-preview";
import { InstagramPostPreview } from "@/components/previews/instagram-post-preview";
import { LinkedInPostPreview } from "@/components/previews/linkedin-post-preview";
import { TwitterPostPreview } from "@/components/previews/twitter-post-preview";
import { PlatformSelectDialog } from "@/components/platform-select-dialog";
import { ContentStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { isPlatformConnected, platformLabel } from "@/lib/platform";
import type { ContentItem, PublishingPlatform, WorkspaceSnapshot } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";

function PlatformBadge({ platform }: { platform: PublishingPlatform | null }) {
  if (!platform) {
    return <span className="text-xs text-zinc-400">No platform</span>;
  }
  return <Badge className="rounded-lg bg-zinc-100 font-normal text-zinc-700">{platformLabel(platform)}</Badge>;
}

export function CommandCenterView() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const generateStrategy = useWorkspaceStore((s) => s.generateStrategy);
  const generateContent = useWorkspaceStore((s) => s.generateContent);
  const approve = useWorkspaceStore((s) => s.approve);
  const reject = useWorkspaceStore((s) => s.reject);
  const publish = useWorkspaceStore((s) => s.publish);
  const { push } = useToast();

  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [calendarDays, setCalendarDays] = useState(14);
  const [platformTargetId, setPlatformTargetId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<PublishingPlatform>("linkedin");
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [publishLoading, setPublishLoading] = useState(false);

  const updateContentItem = useWorkspaceStore((s) => s.updateContentItem);

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  if (!workspace && loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[420px] rounded-2xl" />
        <Skeleton className="h-[420px] rounded-2xl lg:col-span-1" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="py-16 text-center text-sm text-zinc-500">Workspace data is unavailable. Use Retry in the header.</CardContent>
      </Card>
    );
  }

  const openPlatformModal = (id: string) => setPlatformTargetId(id);

  const handlePlatformConfirm = (platforms: PublishingPlatform[]) => {
    if (!platformTargetId) return;
    if (!platforms[0]) return;
    void approve(platformTargetId, platforms)
      .then(() => {
        if (platforms.length > 1) {
          push(`Content approved for ${platforms.length} platforms.`);
        } else {
          push(`Content approved for ${platformLabel(platforms[0])}`);
        }
      })
      .catch(() => push("Approval failed"))
      .finally(() => setPlatformTargetId(null));
  };

  const eligibleToPublish = workspace.content.filter(
    (c) =>
      (c.status === "APPROVED" || c.status === "SCHEDULED") &&
      c.selectedPlatform &&
      isPlatformConnected(workspace.integrations, c.selectedPlatform),
  );
  const blocked = workspace.content.filter(
    (c) =>
      (c.status === "APPROVED" || c.status === "SCHEDULED") &&
      (!c.selectedPlatform || !isPlatformConnected(workspace.integrations, c.selectedPlatform)),
  );

  const scheduledList = workspace.content
    .filter((c) => c.scheduledAt && (c.status === "APPROVED" || c.status === "SCHEDULED" || c.status === "PUBLISHED"))
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  const runPublish = async () => {
    if (eligibleToPublish.length === 0) {
      push("Nothing ready to publish. Approve items, pick a platform, and connect accounts.");
      return;
    }
    setPublishLoading(true);
    try {
      const result = await publish(eligibleToPublish.map((c) => c.id));
      if (result.warnings.length) {
        result.warnings.slice(0, 3).forEach((w) => push(w));
      }
      push(`Published ${result.published} asset(s)`);
    } catch {
      push("Publish request failed");
    } finally {
      setPublishLoading(false);
    }
  };

  const runStrategy = async () => {
    setStrategyLoading(true);
    try {
      await generateStrategy(companyName, website);
      push("Strategy and competitor set updated");
    } finally {
      setStrategyLoading(false);
    }
  };

  const runContent = async () => {
    setContentLoading(true);
    try {
      await generateContent(calendarDays);
      push("Content library refreshed");
    } finally {
      setContentLoading(false);
    }
  };

  const openEdit = (item: ContentItem) => {
    setEditItem(item);
    setEditTitle(item.title);
    setEditText(item.contentText);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    await updateContentItem({
      contentId: editItem.id,
      title: editTitle,
      contentText: editText,
    });
    setEditItem(null);
    push("Content saved");
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-12">
        {/* Left */}
        <Card className="rounded-2xl border-zinc-200 shadow-sm xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Company input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cc-name">Company name</Label>
              <Input
                id="cc-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Northline Digital"
                className="rounded-xl border-zinc-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-web">Website</Label>
              <Input
                id="cc-web"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                className="rounded-xl border-zinc-200"
              />
            </div>
            <Button type="button" className="w-full rounded-2xl" disabled={strategyLoading} onClick={() => void runStrategy()}>
              {strategyLoading ? "Working…" : "Generate strategy"}
            </Button>
            <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4 text-sm text-zinc-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Strategy output</p>
              {workspace.strategy ? (
                <div className="mt-3 space-y-2">
                  <p>
                    <span className="font-medium text-zinc-800">Target audience:</span> {workspace.strategy.targetAudience}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-800">Content themes:</span> {workspace.strategy.contentThemes.join(", ")}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-800">Market gaps:</span> {workspace.strategy.marketGaps.join(" ")}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-zinc-500">Run strategy to populate audience and themes.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Competitors</p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {workspace.competitors.length === 0 && <p className="text-sm text-zinc-500">No competitor cards yet.</p>}
                {workspace.competitors.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm shadow-sm transition hover:border-zinc-300">
                    <p className="font-medium text-zinc-900">{c.name}</p>
                    <p className="mt-1 text-xs text-zinc-600">{c.positioning}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Strengths:</span> {c.strengths.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700">Weaknesses:</span> {c.weaknesses.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Middle */}
        <Card className="rounded-2xl border-zinc-200 shadow-sm xl:col-span-5">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Content queue</CardTitle>
            <Button type="button" variant="secondary" size="sm" className="rounded-xl" disabled={contentLoading} onClick={() => void runContent()}>
              {contentLoading ? "Refreshing…" : "Regenerate library"}
            </Button>
          </CardHeader>
          <CardContent className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {[7, 14, 21, 30].map((days) => (
                <Button key={days} type="button" size="sm" variant={calendarDays === days ? "default" : "outline"} className="rounded-xl" onClick={() => setCalendarDays(days)}>
                  {days}d
                </Button>
              ))}
              <p className="text-xs text-zinc-500">Calendar length</p>
            </div>
            {workspace.content.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500">No content yet. Regenerate the library.</div>
            )}
            {workspace.content.map((item) => (
              <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-900">{item.title}</p>
                    <p className="text-xs text-zinc-500">{item.mediaType}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformBadge platform={item.selectedPlatform} />
                    <ContentStatusBadge status={item.status} />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[140px_1fr]">
                  <img src={item.mediaPreview} alt="" className="aspect-video w-full rounded-xl object-cover" />
                  <p className="text-sm leading-relaxed text-zinc-700">{item.contentText}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.status === "PENDING" && (
                    <Button type="button" size="sm" className="rounded-xl" onClick={() => openPlatformModal(item.id)}>
                      Approve
                    </Button>
                  )}
                  {item.status === "APPROVED" && (
                    <Button type="button" size="sm" variant="secondary" className="rounded-xl" onClick={() => openPlatformModal(item.id)}>
                      Select platform
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={item.status === "PUBLISHED"}
                    onClick={() => void reject(item.id).then(() => push("Marked as rejected"))}
                  >
                    Reject
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => openEdit(item)}>
                    Edit
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="rounded-xl" onClick={() => setPreviewItem(item)}>
                    Preview
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Right */}
        <Card className="rounded-2xl border-zinc-200 shadow-sm xl:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Scheduled posts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {scheduledList.length === 0 && <p className="text-sm text-zinc-500">No scheduled posts.</p>}
              {scheduledList.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{item.title}</p>
                    <p className="text-xs text-zinc-500">{item.scheduledAt ? format(new Date(item.scheduledAt), "PPp") : ""}</p>
                  </div>
                  <PlatformBadge platform={item.selectedPlatform} />
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Calendar preview</p>
              <div className="grid grid-cols-7 gap-1.5">
                {weekDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const count = workspace.content.filter((c) => c.scheduledAt?.startsWith(key)).length;
                  return (
                    <div key={key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-center">
                      <p className="text-[10px] font-medium uppercase text-zinc-400">{format(day, "EEE")}</p>
                      <p className="text-sm font-semibold text-zinc-900">{format(day, "d")}</p>
                      <p className="text-[10px] text-zinc-500">{count ? `${count} slot` : "—"}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Assign slots on the{" "}
                <Link href="/scheduling" className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                  Scheduling
                </Link>{" "}
                page using drag-and-drop.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom */}
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardContent className="flex flex-col gap-4 py-6 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Publishing</p>
            <Button type="button" className="w-full max-w-xs rounded-2xl" disabled={publishLoading} onClick={() => void runPublish()}>
              {publishLoading ? "Publishing…" : `Publish ready (${eligibleToPublish.length})`}
            </Button>
            {blocked.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-medium">Action required</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {blocked.map((b) => (
                    <li key={b.id}>
                      {b.title}:{" "}
                      {!b.selectedPlatform
                        ? "Select a platform when approving."
                        : !isPlatformConnected(workspace.integrations, b.selectedPlatform)
                          ? `${platformLabel(b.selectedPlatform)} is not connected — open Settings → Integrations.`
                          : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex-1 border-t border-zinc-100 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Automation status</p>
            <p className="mt-1 text-sm text-zinc-600">Publishing is connected to approval, scheduling, and platform integrations.</p>
            <p className="mt-2 text-sm text-zinc-600">
              Open <Link href="/publishing" className="font-medium text-zinc-900 underline-offset-2 hover:underline">Publishing</Link> to run manual or cron cycles.
            </p>
          </div>
        </CardContent>
      </Card>

      <PlatformSelectDialog
        open={Boolean(platformTargetId)}
        onOpenChange={(o) => !o && setPlatformTargetId(null)}
        onConfirm={(platforms) => void handlePlatformConfirm(platforms)}
      />

      <Dialog open={Boolean(editItem)} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit content</DialogTitle>
            <DialogDescription>Updates reset approval until reviewed again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="rounded-xl" />
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-28 rounded-xl" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" onClick={() => void saveEdit()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewItem)} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Platform preview</DialogTitle>
            <DialogDescription>Review formatting before scheduling or publishing.</DialogDescription>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(["linkedin", "instagram", "facebook", "twitter"] as const).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={previewPlatform === p ? "default" : "outline"}
                    className="rounded-xl"
                    onClick={() => setPreviewPlatform(p)}
                  >
                    {platformLabel(p)}
                  </Button>
                ))}
              </div>
              <PreviewPane item={previewItem} workspace={workspace} platform={previewPlatform} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewPane({
  item,
  workspace,
  platform,
}: {
  item: ContentItem;
  workspace: WorkspaceSnapshot;
  platform: PublishingPlatform;
}) {
  if (platform === "linkedin") {
    return <LinkedInPostPreview item={item} workspace={workspace} />;
  }
  if (platform === "instagram") {
    return <InstagramPostPreview item={item} workspace={workspace} />;
  }
  if (platform === "twitter") {
    return <TwitterPostPreview item={item} workspace={workspace} />;
  }
  return <FacebookPostPreview item={item} workspace={workspace} />;
}
