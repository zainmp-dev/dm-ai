"use client";

import { useMemo, useState } from "react";
import { Calendar, CheckCircle2, Clock, Search } from "lucide-react";
import { ContentStatusBadge } from "@/components/status-badge";
import { MediaLocalDropzone } from "@/components/media-local-dropzone";
import { MediaPreviewBlock } from "@/components/media-preview-block";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { ContentStatus, MediaType, PublishingPlatform } from "@/lib/types";
import { apiErrorMessage, apiUploadMediaLocal, apiUploadMediaToCloudinary, sanitizeMediaUrl } from "@/lib/api";
import { shouldUseVideoElement } from "@/lib/media-detect";
import { isPlatformConnected, platformLabel } from "@/lib/platform";
import {
  applyTimePresetInZone,
  effectiveContentTimeZone,
  formatInstantInZone,
  toDateTimeLocalInZone,
  zonedLocalToUtcIso,
} from "@/lib/workspace-datetime";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";

const PLATFORM_OPTIONS: { id: PublishingPlatform; label: string; disabled?: boolean }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "Twitter / X", disabled: true },
];
const ACTIVE_PLATFORM_OPTIONS = PLATFORM_OPTIONS.filter((opt) => !opt.disabled);

const STATUS_FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED", "PUBLISHED"] as const;

function QueueThumb({ url, mediaType }: { url: string; mediaType: MediaType }) {
  const safe = sanitizeMediaUrl(url);
  const useVideo = Boolean(safe && shouldUseVideoElement(safe, mediaType));
  const videoFallback = mediaType === "Video" && !useVideo;
  const shell = "h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100 dark:border-zinc-700";
  if (!safe) {
    return <div className={shell} aria-hidden />;
  }
  return (
    <div className="relative h-14 w-[4.5rem] shrink-0">
      {useVideo ? (
        <video src={safe} muted playsInline preload="metadata" className={`${shell} object-cover`} aria-hidden />
      ) : (
        <img src={safe} alt="" className={`${shell} object-cover`} loading="lazy" />
      )}
      {mediaType === "Carousel" ? (
        <span className="absolute bottom-0.5 right-0.5 z-[1] rounded bg-zinc-900/85 px-0.5 text-[7px] font-bold uppercase leading-none text-white">
          C
        </span>
      ) : null}
      {videoFallback ? (
        <span className="absolute bottom-0.5 left-0.5 z-[1] rounded bg-violet-800/90 px-0.5 text-[7px] font-bold uppercase leading-none text-white">
          V
        </span>
      ) : null}
    </div>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function sortKeyMs(item: { scheduledAt: string | null; updatedAt?: string; createdAt?: string }) {
  const raw = item.scheduledAt ?? item.updatedAt ?? item.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function ApprovalTab() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const approve = useWorkspaceStore((s) => s.approve);
  const reject = useWorkspaceStore((s) => s.reject);
  const schedule = useWorkspaceStore((s) => s.schedule);
  const updateContentItem = useWorkspaceStore((s) => s.updateContentItem);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const { push } = useToast();
  const [filter, setFilter] = useState<ContentStatus | "ALL">("PENDING");
  const [search, setSearch] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftScheduleAt, setDraftScheduleAt] = useState("");
  const [draftMediaPreview, setDraftMediaPreview] = useState("");
  const [draftMediaType, setDraftMediaType] = useState<MediaType>("Image");
  const [postNow, setPostNow] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PublishingPlatform[]>([]);
  const [allPlatformsChecked, setAllPlatformsChecked] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerView, setMediaPickerView] = useState<"upload" | "library">("upload");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const content = useMemo(() => workspace?.content ?? [], [workspace?.content]);
  const contentTimeZone = useMemo(
    () => effectiveContentTimeZone(workspace?.profile?.timezone, workspace?.primaryRegion),
    [workspace?.profile?.timezone, workspace?.primaryRegion],
  );
  const mediaLibrary = workspace?.mediaLibrary ?? [];

  const usedMediaByOtherItems = useMemo(() => {
    const id = viewingId;
    return new Set(
      content.filter((c) => c.id !== id).map((c) => c.mediaPreview).filter(Boolean),
    );
  }, [content, viewingId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = filter === "ALL" ? content : content.filter((item) => item.status === filter);
    if (q) {
      rows = rows.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.contentText.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => sortKeyMs(b) - sortKeyMs(a));
  }, [content, filter, search]);

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
    setDraftScheduleAt(toDateTimeLocalInZone(item.scheduledAt, contentTimeZone));
    setDraftMediaPreview(item.mediaPreview);
    setDraftMediaType(item.mediaType);
    setPostNow(!item.scheduledAt);
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
    setDraftMediaPreview("");
    setDraftMediaType("Image");
    setPostNow(true);
    setSelectedPlatforms([]);
    setAllPlatformsChecked(false);
    setMediaPickerOpen(false);
  };

  const applyPickedMedia = (url: string, type: MediaType) => {
    setDraftMediaPreview(url);
    setDraftMediaType(type);
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
      <CardHeader className="space-y-4 border-b border-zinc-100 pb-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Approval queue</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "secondary"}
                className="h-8 rounded-lg px-2.5 text-xs"
                onClick={() => setFilter(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, text, or ID…"
            className="h-10 rounded-xl pl-9"
            autoComplete="off"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500">Nothing in this queue.</p>
        )}
        {filtered.map((item) => {
          const scheduledLabel = item.scheduledAt ? formatInstantInZone(item.scheduledAt, contentTimeZone) : null;
          const updatedLabel = item.updatedAt ? formatInstantInZone(item.updatedAt, contentTimeZone) : null;
          const createdLabel = item.createdAt ? formatInstantInZone(item.createdAt, contentTimeZone) : null;
          const bodyOneLine = item.contentText.trim().replace(/\s+/g, " ");
          const bodyPreview = bodyOneLine.length > 120 ? `${bodyOneLine.slice(0, 120)}…` : bodyOneLine;
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => openViewDialog(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openViewDialog(item.id);
                }
              }}
              className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 outline-none transition hover:border-zinc-200 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/30 dark:hover:border-zinc-700"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <QueueThumb url={item.mediaPreview} mediaType={item.mediaType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {item.selectedPlatform ? platformLabel(item.selectedPlatform) : "No platform selected"}
                    {scheduledLabel ? (
                      <>
                        <span className="text-zinc-300 dark:text-zinc-600"> · </span>
                        <span className="tabular-nums">Publish {scheduledLabel}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                    {createdLabel ? (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar className="size-3 shrink-0 opacity-70" aria-hidden />
                        Added {createdLabel}
                      </span>
                    ) : null}
                    {updatedLabel && updatedLabel !== createdLabel ? (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="size-3 shrink-0 opacity-70" aria-hidden />
                        Updated {updatedLabel}
                      </span>
                    ) : null}
                  </p>
                  {bodyPreview ? (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{bodyPreview}</p>
                  ) : (
                    <p className="mt-1.5 text-xs italic text-zinc-400">No caption</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={(e) => {
                    e.stopPropagation();
                    openViewDialog(item.id);
                  }}
                >
                  View
                </Button>
                <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <ContentStatusBadge status={item.status} />
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
      {viewingItem && (
        <Dialog open={Boolean(viewingItem)} onOpenChange={(open) => !open && closeViewDialog()}>
          <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="space-y-1 border-b border-zinc-100 p-6 pb-4 pr-14 text-left dark:border-zinc-800">
              <DialogTitle>View and edit content</DialogTitle>
              <DialogDescription>
                Update copy and media, set publish timing ({contentTimeZone}), choose platforms, then approve or reject.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(58vh,520px)] space-y-4 overflow-y-auto px-6 py-4">
              <div className="grid gap-2">
                <Label className="text-zinc-600" htmlFor="approval-title">
                  Title
                </Label>
                <Input id="approval-title" value={draftTitle} disabled={isReadonlyItem} onChange={(e) => setDraftTitle(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-600" htmlFor="approval-text">
                  Content
                </Label>
                <Textarea
                  id="approval-text"
                  className="min-h-[7.5rem] rounded-xl"
                  value={draftText}
                  disabled={isReadonlyItem}
                  onChange={(e) => setDraftText(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-600">Media</Label>
                <p className="text-xs text-zinc-500">Preview, paste an image or video URL, or pick from upload / library.</p>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <div className="mx-auto max-w-md">
                    <MediaPreviewBlock
                      url={draftMediaPreview}
                      mediaType={draftMediaType}
                      className="aspect-video max-h-52 w-full"
                      videoClassName="h-full max-h-52 rounded-lg object-contain"
                      imgClassName="h-full max-h-52 rounded-lg object-contain"
                    />
                  </div>
                  {!isReadonlyItem ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:items-end">
                      <div className="sm:col-span-2">
                        <Label htmlFor="approval-media-type" className="text-xs text-zinc-600">
                          Media type
                        </Label>
                        <select
                          id="approval-media-type"
                          value={draftMediaType}
                          onChange={(e) => setDraftMediaType(e.target.value as MediaType)}
                          className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          <option value="Image">Image</option>
                          <option value="Video">Video</option>
                          <option value="Carousel">Carousel</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="approval-media-url" className="text-xs text-zinc-600">
                          Media URL
                        </Label>
                        <Input
                          id="approval-media-url"
                          value={draftMediaPreview}
                          placeholder="https://…"
                          onChange={(e) => setDraftMediaPreview(e.target.value)}
                          className="mt-1 rounded-xl"
                        />
                      </div>
                      <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setMediaPickerOpen(true)}>
                        Upload or library…
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                          setDraftMediaPreview("");
                          setDraftMediaType("Image");
                        }}
                      >
                        Clear media
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-600">Schedule</Label>
                <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-zinc-300 text-zinc-900"
                      checked={postNow}
                      disabled={isReadonlyItem}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setPostNow(on);
                        if (on) return;
                        if (!draftScheduleAt) {
                          setDraftScheduleAt(
                            toDateTimeLocalInZone(applyTimePresetInZone("1h", contentTimeZone), contentTimeZone),
                          );
                        }
                      }}
                    />
                    <span>
                      <span className="font-medium">Post when approved (no schedule)</span>
                      <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                        Publishes from the queue as soon as it is ready — no future time slot.
                      </span>
                    </span>
                  </label>
                  <div className="grid gap-2">
                    <Label className="text-xs text-zinc-600" htmlFor="approval-schedule">
                      Or pick date and time
                    </Label>
                    <Input
                      id="approval-schedule"
                      type="datetime-local"
                      value={draftScheduleAt}
                      disabled={isReadonlyItem || postNow}
                      onChange={(e) => {
                        setPostNow(false);
                        setDraftScheduleAt(e.target.value);
                      }}
                    />
                    {!postNow ? (
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { label: "+30m", preset: "30m" as const },
                            { label: "+1h", preset: "1h" as const },
                            { label: "+2h", preset: "2h" as const },
                            { label: "Tmr 9:00", preset: "tomorrow-9am" as const },
                          ] as const
                        ).map(({ label, preset }) => (
                          <Button
                            key={preset}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg text-xs"
                            disabled={isReadonlyItem}
                            onClick={() => {
                              setPostNow(false);
                              setDraftScheduleAt(
                                toDateTimeLocalInZone(applyTimePresetInZone(preset, contentTimeZone), contentTimeZone),
                              );
                            }}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-zinc-600">Publishing platforms</Label>
                <p className="text-xs text-zinc-500">
                  Pick at least one channel. Use &quot;All active platforms&quot; to select every available network at once.
                </p>
                <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800 shadow-sm transition hover:border-zinc-300">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-zinc-300 text-zinc-900"
                      checked={allPlatformsChecked}
                      disabled={isReadonlyItem}
                      onChange={(e) => toggleAllPlatforms(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium">All active platforms</span>
                      <span className="mt-0.5 block text-xs font-normal text-zinc-500">Publishes to each connected channel after media is ready.</span>
                    </span>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PLATFORM_OPTIONS.map((opt) => (
                      <label
                        key={opt.id}
                        title={opt.disabled ? "Coming soon" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
                          opt.disabled
                            ? "cursor-not-allowed border-zinc-200/80 bg-zinc-100/80 text-zinc-400"
                            : "cursor-pointer border-zinc-200 bg-white text-zinc-800 shadow-sm hover:border-zinc-300",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 rounded border-zinc-300 text-zinc-900"
                          checked={selectedPlatforms.includes(opt.id)}
                          disabled={isReadonlyItem || opt.disabled}
                          onChange={() => togglePlatform(opt.id)}
                        />
                        {opt.label}
                        {opt.disabled ? <span className="text-xs text-zinc-400">Coming soon</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <Separator />
            <div className="flex flex-col gap-3 p-6 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" className="text-zinc-600" onClick={closeViewDialog}>
                  Cancel
                </Button>
                {!isReadonlyItem && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const media = draftMediaPreview.trim();
                      void updateContentItem({
                        contentId: viewingItem.id,
                        title: draftTitle.trim() || viewingItem.title,
                        contentText: draftText.trim() || viewingItem.contentText,
                        mediaType: draftMediaType,
                        ...(media ? { mediaPreview: media } : {}),
                      }).then(() => push("Content edits saved"));
                    }}
                  >
                    Save edits
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canRejectItem && (
                  <Button
                    type="button"
                    variant="destructive"
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
                    className="h-10 min-w-[8.5rem] gap-2 font-semibold shadow-sm"
                    onClick={() => {
                      if (selectedPlatforms.length === 0) {
                        push("Please select at least one platform.");
                        return;
                      }
                      const disconnected = selectedPlatforms.filter((p) => !isPlatformConnected(workspace.integrations, p));
                      if (disconnected.length > 0) {
                        push(`Connect ${disconnected.map((p) => platformLabel(p)).join(", ")} in Settings before approving.`);
                        return;
                      }
                      if (!postNow && !draftScheduleAt.trim()) {
                        push("Pick a scheduled time, or turn on “Post when approved”.");
                        return;
                      }
                      const apply = async () => {
                        const media = draftMediaPreview.trim() || viewingItem.mediaPreview;
                        await updateContentItem({
                          contentId: viewingItem.id,
                          title: draftTitle.trim() || viewingItem.title,
                          contentText: draftText.trim() || viewingItem.contentText,
                          mediaType: draftMediaType,
                          mediaPreview: media,
                          scheduledAt: postNow ? null : undefined,
                        });
                        if (!postNow && draftScheduleAt) {
                          await schedule(viewingItem.id, zonedLocalToUtcIso(draftScheduleAt, contentTimeZone));
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
                    <CheckCircle2 className="size-4 shrink-0" />
                    Approve
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <Dialog open={mediaPickerOpen} onOpenChange={setMediaPickerOpen}>
        <DialogContent className="z-[100] max-w-3xl">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle>Media</DialogTitle>
            <DialogDescription>Upload a file or pick from this workspace library.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Button
                type="button"
                variant={mediaPickerView === "upload" ? "default" : "secondary"}
                className="w-full rounded-xl"
                onClick={() => setMediaPickerView("upload")}
              >
                From computer
              </Button>
              <Button
                type="button"
                variant={mediaPickerView === "library" ? "default" : "secondary"}
                className="w-full rounded-xl"
                onClick={() => setMediaPickerView("library")}
              >
                Media library
              </Button>
            </div>
            <div className="space-y-3">
              {mediaPickerView === "upload" && workspace ? (
                <div className="space-y-3">
                  <Label className="text-zinc-700 dark:text-zinc-300">Upload from your device</Label>
                  <MediaLocalDropzone
                    busy={uploadingMedia}
                    disabled={uploadingMedia}
                    onFiles={(fl) => {
                      void (async () => {
                        if (fl.length === 0 || !workspace) return;
                        const max = 8 * 1024 * 1024;
                        const over = fl.filter((f) => f.size > max);
                        if (over.length) {
                          push(`${over.length} file(s) skipped (over 8MB).`);
                        }
                        const files = fl.filter((f) => f.size <= max);
                        if (files.length === 0) return;
                        setUploadingMedia(true);
                        try {
                          let lastUrl = "";
                          let lastType: MediaType = "Image";
                          for (const file of files) {
                            const dataUrl = await fileToDataUrl(file);
                            const mediaType: MediaType = file.type.startsWith("video/") ? "Video" : "Image";
                            const { mediaUrl, mediaType: uploadedMediaType } = workspace.cloudinaryUploadsReady
                              ? await apiUploadMediaToCloudinary({
                                  dataUrl,
                                  fileName: file.name,
                                  mediaType,
                                })
                              : await apiUploadMediaLocal({
                                  dataUrl,
                                  fileName: file.name,
                                  mediaType,
                                });
                            lastUrl = mediaUrl;
                            lastType = uploadedMediaType;
                            push(`Saved · ${file.name}`);
                          }
                          await refreshWorkspace({ soft: true });
                          if (files.length === 1 && lastUrl) {
                            if (usedMediaByOtherItems.has(lastUrl)) {
                              push("This media is already used in another post.");
                            } else {
                              applyPickedMedia(lastUrl, lastType);
                              push("Media added");
                              setMediaPickerOpen(false);
                            }
                          } else {
                            push(`Done: ${files.length} file(s) added to your library.`);
                            setMediaPickerView("library");
                          }
                        } catch (error) {
                          push(apiErrorMessage(error));
                        } finally {
                          setUploadingMedia(false);
                        }
                      })();
                    }}
                  />
                </div>
              ) : null}
              {mediaPickerView === "library" ? (
                <div className="space-y-2">
                  <Label>Choose saved media</Label>
                  {mediaLibrary.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      No media in this workspace yet. Use &quot;From computer&quot; to upload.
                    </p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-3">
                      {mediaLibrary.slice(0, 12).map((asset) => {
                        const locked = usedMediaByOtherItems.has(asset.mediaUrl);
                        return (
                          <div
                            key={`approval-picker-${asset.id}`}
                            className="rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900/80"
                          >
                            <button
                              type="button"
                              className="w-full text-left"
                              disabled={locked}
                              onClick={() => {
                                if (locked) {
                                  push("This media is already mapped in content and cannot be reused.");
                                  return;
                                }
                                applyPickedMedia(asset.mediaUrl, asset.mediaType);
                                setMediaPickerOpen(false);
                              }}
                            >
                              <div className="aspect-video w-full">
                                <MediaPreviewBlock
                                  url={asset.mediaUrl}
                                  mediaType={asset.mediaType}
                                  className="h-full w-full"
                                  videoClassName="h-full w-full rounded-lg object-cover"
                                  imgClassName="h-full w-full rounded-lg object-cover"
                                />
                              </div>
                              <p className="mt-1 truncate text-xs text-zinc-600">{asset.name}</p>
                              {locked ? (
                                <p className="mt-1 text-[11px] font-medium text-amber-700">Already used in content</p>
                              ) : null}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
