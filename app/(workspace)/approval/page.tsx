"use client";

import { useMemo, useState } from "react";
import { ContentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { ContentStatus, PublishingPlatform } from "@/lib/types";
import { platformLabel } from "@/lib/platform";
import { useWorkspaceStore } from "@/lib/workspace-store";

const PLATFORM_OPTIONS: { id: PublishingPlatform; label: string; disabled?: boolean }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "Twitter / X", disabled: true },
];
const ACTIVE_PLATFORM_OPTIONS = PLATFORM_OPTIONS.filter((opt) => !opt.disabled);
const ALL_MEDIA_OPTION_ID = "__all_media__";

export default function ApprovalPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const approve = useWorkspaceStore((s) => s.approve);
  const reject = useWorkspaceStore((s) => s.reject);
  const schedule = useWorkspaceStore((s) => s.schedule);
  const updateContentItem = useWorkspaceStore((s) => s.updateContentItem);
  const { push } = useToast();
  const [filter, setFilter] = useState<ContentStatus | "ALL">("PENDING");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftScheduleAt, setDraftScheduleAt] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PublishingPlatform[]>([]);
  const [allPlatformsChecked, setAllPlatformsChecked] = useState(false);

  const content = workspace?.content ?? [];

  const filtered = useMemo(
    () => (filter === "ALL" ? content : content.filter((item) => item.status === filter)),
    [content, filter],
  );

  const viewingItem = content.find((item) => item.id === viewingId) ?? null;
  const isReadonlyItem = viewingItem?.status === "PUBLISHED";
  const canRejectItem = viewingItem ? viewingItem.status !== "PUBLISHED" && viewingItem.status !== "REJECTED" : false;
  const canApproveItem = viewingItem ? viewingItem.status !== "PUBLISHED" : false;

  const openViewDialog = (id: string) => {
    const item = content.find((row) => row.id === id);
    if (!item) return;
    setViewingId(id);
    setDraftTitle(item.title);
    setDraftText(item.contentText);
    setDraftScheduleAt(toDateTimeLocalValue(item.scheduledAt));
    if (item.selectedPlatform) {
      setSelectedPlatforms([item.selectedPlatform]);
      setAllPlatformsChecked(false);
    } else {
      setSelectedPlatforms([]);
      setAllPlatformsChecked(false);
    }
  };

  const closeViewDialog = () => {
    setViewingId(null);
    setDraftTitle("");
    setDraftText("");
    setDraftScheduleAt("");
    setSelectedPlatforms([]);
    setAllPlatformsChecked(false);
  };

  const togglePlatform = (platform: PublishingPlatform) => {
    const option = PLATFORM_OPTIONS.find((opt) => opt.id === platform);
    if (option?.disabled) return;
    setAllPlatformsChecked(false);
    setSelectedPlatforms((current) => (current.includes(platform) ? current.filter((id) => id !== platform) : [...current, platform]));
  };

  const toggleAllPlatforms = (checked: boolean) => {
    setAllPlatformsChecked(checked);
    setSelectedPlatforms(checked ? ACTIVE_PLATFORM_OPTIONS.map((opt) => opt.id) : []);
  };

  if (!workspace && loading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <Card className="rounded-2xl border-zinc-200 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">Approval queue</CardTitle>
        <div className="flex flex-wrap gap-2">
          {(["ALL", "PENDING", "APPROVED", "REJECTED", "PUBLISHED"] as const).map((value) => (
            <Button key={value} size="sm" variant={filter === value ? "default" : "secondary"} className="rounded-xl" onClick={() => setFilter(value)}>
              {value}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filtered.length === 0 && <p className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500">Nothing in this queue.</p>}
        {filtered.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
                <p className="text-xs text-zinc-500">{item.selectedPlatform ? platformLabel(item.selectedPlatform) : "No platform selected"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" className="rounded-xl" onClick={() => openViewDialog(item.id)}>
                View
              </Button>
            </div>
            <ContentStatusBadge status={item.status} />
          </div>
        ))}
      </CardContent>
      {viewingItem && (
        <Dialog open={Boolean(viewingItem)} onOpenChange={(open) => !open && closeViewDialog()}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>View and Edit Content</DialogTitle>
              <DialogDescription>Update content, set schedule, and approve from one place.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="approval-title">Title</Label>
                <Input id="approval-title" value={draftTitle} disabled={isReadonlyItem} onChange={(e) => setDraftTitle(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="approval-text">Content</Label>
                <Textarea id="approval-text" className="min-h-28" value={draftText} disabled={isReadonlyItem} onChange={(e) => setDraftText(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="approval-schedule">Schedule setup</Label>
                <Input id="approval-schedule" type="datetime-local" value={draftScheduleAt} disabled={isReadonlyItem} onChange={(e) => setDraftScheduleAt(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Select Publishing Platform</Label>
                <div className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <input type="checkbox" checked={allPlatformsChecked} disabled={isReadonlyItem} onChange={(e) => toggleAllPlatforms(e.target.checked)} />
                    All Media (publish after all media)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={allPlatformsChecked}
                      disabled={isReadonlyItem}
                      onChange={(e) => toggleAllPlatforms(e.target.checked)}
                      aria-label={ALL_MEDIA_OPTION_ID}
                    />
                    All
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PLATFORM_OPTIONS.map((opt) => (
                      <label
                        key={opt.id}
                        title={opt.disabled ? "Coming soon" : undefined}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          opt.disabled ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500" : "border-zinc-200 bg-white text-zinc-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlatforms.includes(opt.id)}
                          disabled={isReadonlyItem || opt.disabled}
                          onChange={() => togglePlatform(opt.id)}
                        />
                        {opt.label}
                        {opt.disabled ? " (Coming soon)" : ""}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={closeViewDialog}>
                Cancel
              </Button>
              {!isReadonlyItem && (
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => {
                    void updateContentItem({
                      contentId: viewingItem.id,
                      title: draftTitle.trim() || viewingItem.title,
                      contentText: draftText.trim() || viewingItem.contentText,
                    }).then(() => push("Content edits saved"));
                  }}
                >
                  Save Edits
                </Button>
              )}
              {canRejectItem && (
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-xl"
                  onClick={() => {
                    void reject(viewingItem.id).then(() => {
                      push("Item rejected");
                      closeViewDialog();
                    });
                  }}
                >
                  Reject
                </Button>
              )}
              {canApproveItem && (
                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={() => {
                    if (selectedPlatforms.length === 0) {
                      push("Please select at least one platform.");
                      return;
                    }
                    const apply = async () => {
                      await updateContentItem({
                        contentId: viewingItem.id,
                        title: draftTitle.trim() || viewingItem.title,
                        contentText: draftText.trim() || viewingItem.contentText,
                      });
                      if (draftScheduleAt) {
                        await schedule(viewingItem.id, new Date(draftScheduleAt).toISOString());
                      }
                        await approve(viewingItem.id, selectedPlatforms);
                    };
                    void apply().then(() => {
                      if (allPlatformsChecked || selectedPlatforms.length > 1) {
                        push(`Approved for ${selectedPlatforms.length} platforms.`);
                      } else {
                        push(`Approved for ${platformLabel(selectedPlatforms[0])}`);
                      }
                      closeViewDialog();
                    });
                  }}
                >
                  Approve
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
