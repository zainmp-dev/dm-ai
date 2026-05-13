"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { prepareFileForUpload } from "@/lib/prepare-upload-file";
import { shouldUseVideoElement } from "@/lib/media-detect";
import { isPlatformConnected, platformLabel } from "@/lib/platform";
import {
  applyTimePresetInZone,
  effectiveContentTimeZone,
  formatInstantInZone,
  toDateTimeLocalInZone,
  zonedLocalToUtcIso,
} from "@/lib/workspace-datetime";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";

const PLATFORM_OPTIONS: { id: PublishingPlatform; label: string; comingSoon?: boolean }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "Twitter / X", comingSoon: true },
];
const ACTIVE_PLATFORM_OPTIONS = PLATFORM_OPTIONS.filter((opt) => !opt.comingSoon);

const STATUS_FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED", "PUBLISHED"] as const;
const STATUS_FILTER_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  ALL: "All",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PUBLISHED: "Published",
};
const PAGE_SIZE_OPTIONS = [8, 12] as const;

const MEDIA_PICKER_HELPER_DISMISSED_KEY = "dm-ai-pipeline-media-picker-helper-dismissed";

function mediaPickerHelperStillWanted(): boolean {
  if (typeof globalThis.window === "undefined") return false;
  try {
    return globalThis.localStorage?.getItem(MEDIA_PICKER_HELPER_DISMISSED_KEY) !== "1";
  } catch {
    return true;
  }
}

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
        // eslint-disable-next-line @next/next/no-img-element
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
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const approve = useWorkspaceStore((s) => s.approve);
  const reject = useWorkspaceStore((s) => s.reject);
  const schedule = useWorkspaceStore((s) => s.schedule);
  const publish = useWorkspaceStore((s) => s.publish);
  const updateContentItem = useWorkspaceStore((s) => s.updateContentItem);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const { push } = useToast();
  const [filter, setFilter] = useState<ContentStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [pageSize, setPageSize] = useState<number>(12);
  const [page, setPage] = useState(1);
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
  const [mediaUploadPaneNonce, setMediaUploadPaneNonce] = useState(0);
  const [mediaPickerHelperAcked, setMediaPickerHelperAcked] = useState(false);
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
    const q = deferredSearch.trim().toLowerCase();
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
  }, [content, deferredSearch, filter]);

  useEffect(() => {
    startTransition(() => setPage(1));
  }, [filter, deferredSearch, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, safePage]);

  const viewingItem = content.find((item) => item.id === viewingId) ?? null;
  const isReadonlyItem = viewingItem?.status === "PUBLISHED";
  const canRejectItem = viewingItem ? viewingItem.status !== "PUBLISHED" && viewingItem.status !== "REJECTED" : false;
  const canApproveItem = viewingItem ? viewingItem.status !== "PUBLISHED" : false;

  const getPostNowValidationError = () => {
    if (selectedPlatforms.length === 0) return "Please select at least one platform.";
    if (!workspace) return "Workspace unavailable.";
    const disconnected = selectedPlatforms.filter((p) => !isPlatformConnected(workspace.integrations, p));
    if (disconnected.length > 0) {
      return `Connect ${disconnected.map((p) => platformLabel(p)).join(", ")} in Settings before approving.`;
    }
    const needsMedia = postNow && selectedPlatforms.includes("instagram");
    if (needsMedia && !draftMediaPreview.trim()) {
      return "Instagram Feed needs image media here. Add a public image URL before Post Now.";
    }
    return null;
  };

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
    if (option?.comingSoon) return;
    setAllPlatformsChecked(false);
    setSelectedPlatforms((current) => (current.includes(platform) ? current.filter((id) => id !== platform) : [...current, platform]));
  };

  const toggleAllPlatforms = (checked: boolean) => {
    setAllPlatformsChecked(checked);
    setSelectedPlatforms(checked ? ACTIVE_PLATFORM_OPTIONS.map((opt) => opt.id) : []);
  };

  const dismissMediaPickerHelper = () => {
    try {
      globalThis.localStorage?.setItem(MEDIA_PICKER_HELPER_DISMISSED_KEY, "1");
    } catch {
      /* ignore quota / privacy mode */
    }
    setMediaPickerHelperAcked(true);
  };

  const showMediaPickerHelper = mediaPickerOpen && !mediaPickerHelperAcked && mediaPickerHelperStillWanted();

  if (shellPending) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <Card className="rounded-2xl border-zinc-200 shadow-sm">
      <CardHeader className="space-y-4 border-b border-zinc-100 pb-4 dark:border-zinc-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Approval queue</CardTitle>
            <p className="text-xs text-zinc-500">Review, edit, and publish-ready posts in one clean queue.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="approval-page-size" className="text-xs text-zinc-500">
              Per page
            </Label>
            <select
              id="approval-page-size"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm transition-colors dark:border-zinc-700 dark:bg-zinc-950"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
          <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "secondary"}
                className={cn(
                  "h-10 rounded-xl px-4 text-sm font-medium transition-all duration-200",
                  filter === value
                    ? "bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    : "border border-zinc-200 bg-zinc-100/80 text-zinc-700 hover:bg-zinc-200/70 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
                )}
                onClick={() => setFilter(value)}
              >
                {STATUS_FILTER_LABELS[value]}
                <span className="ml-2 rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                  {value === "ALL" ? content.length : content.filter((item) => item.status === value).length}
                </span>
              </Button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, text, or ID…"
              className="h-11 rounded-xl pl-9"
              autoComplete="off"
            />
          </div>
          <div />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {pagedRows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500">Nothing in this queue.</p>
        )}
        {pagedRows.map((item) => {
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
              className="flex min-h-[132px] cursor-pointer flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 outline-none transition-all duration-200 hover:border-zinc-200 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/30 dark:hover:border-zinc-700"
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
                  className="h-10 rounded-xl border border-zinc-200 bg-zinc-100 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
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
        {filtered.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              Page {safePage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-10 rounded-xl px-4 text-sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 rounded-xl px-4 text-sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
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
                <p className="text-xs text-zinc-500">
                  Preview, paste a URL, or open upload / library — that picker stays on top of this sheet so you never lose context.
                </p>
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
                      <Button
                        type="button"
                        variant="secondary"
                        className="rounded-xl"
                        onClick={() => {
                          setMediaPickerView("upload");
                          setMediaUploadPaneNonce((n) => n + 1);
                          setMediaPickerOpen(true);
                        }}
                      >
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
                      <span className="font-medium">Post Now when approved (no schedule)</span>
                      <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                        Auto-publishes immediately after approval once platform checks pass.
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
                    {PLATFORM_OPTIONS.map((opt) =>
                      opt.comingSoon ? (
                        <label
                          key={opt.id}
                          title="Coming soon — X publishing is not wired yet"
                          className="flex cursor-not-allowed items-center gap-2.5 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/90 px-3 py-2.5 text-sm text-zinc-500 opacity-85 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400"
                        >
                          <input type="checkbox" className="size-4 rounded border-zinc-300 text-zinc-900" checked={false} disabled readOnly />
                          <span>
                            {opt.label}
                            <span className="ml-2 text-xs font-normal">Coming soon</span>
                          </span>
                        </label>
                      ) : (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 shadow-sm hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-100 dark:hover:border-zinc-600"
                        >
                          <input
                            type="checkbox"
                            className="size-4 rounded border-zinc-300 text-zinc-900"
                            checked={selectedPlatforms.includes(opt.id)}
                            disabled={isReadonlyItem}
                            onChange={() => togglePlatform(opt.id)}
                          />
                          {opt.label}
                        </label>
                      ),
                    )}
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
                      const validationError = getPostNowValidationError();
                      if (validationError) {
                        push(validationError);
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
                        const approvedIds = await approve(viewingItem.id, selectedPlatforms);
                        if (postNow) {
                          const publishResult = await publish(approvedIds);
                          if (publishResult.warnings.length > 0) {
                            push(`Post Now published ${publishResult.published}. ${publishResult.warnings[0]}`);
                          } else if (publishResult.published > 0) {
                            push("Post Now published successfully.");
                          } else {
                            push("Post Now could not publish yet. Check publishing warnings.");
                          }
                          return;
                        }
                      };
                      void apply()
                        .then(() => {
                          if (postNow) {
                            closeViewDialog();
                            return;
                          }
                          if (allPlatformsChecked || selectedPlatforms.length > 1) {
                            push(`Approved for ${selectedPlatforms.length} platforms.`);
                          } else {
                            push(`Approved for ${platformLabel(selectedPlatforms[0])}`);
                          }
                          closeViewDialog();
                        })
                        .catch((err: unknown) => {
                          push(apiErrorMessage(err));
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
        <DialogContent overlayClassName="z-[110]" className="z-[111] max-w-3xl">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle>Media</DialogTitle>
            <DialogDescription>Upload a file or pick from this workspace library.</DialogDescription>
          </DialogHeader>
          {showMediaPickerHelper ? (
            <div
              className="flex flex-col gap-2 rounded-xl border border-sky-200/90 bg-sky-50/80 px-3 py-2.5 text-sm text-sky-950 dark:border-sky-800/70 dark:bg-sky-950/35 dark:text-sky-50 sm:flex-row sm:items-center sm:justify-between"
              role="status"
            >
              <p className="leading-snug">
                This picker opens <span className="font-medium">above</span> the review sheet. Finish here, close the picker, then continue approving or scheduling.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 rounded-lg text-sky-900 hover:bg-sky-100/80 dark:text-sky-100 dark:hover:bg-sky-900/60"
                onClick={dismissMediaPickerHelper}
              >
                Got it
              </Button>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Button
                type="button"
                variant={mediaPickerView === "upload" ? "default" : "secondary"}
                className="w-full rounded-xl"
                onClick={() => {
                  setMediaPickerView("upload");
                  setMediaUploadPaneNonce((n) => n + 1);
                }}
              >
                From computer
              </Button>
              <Button type="button" variant={mediaPickerView === "library" ? "default" : "secondary"} className="w-full rounded-xl" onClick={() => setMediaPickerView("library")}>
                Media library
              </Button>
            </div>
            <div className="space-y-3">
              {mediaPickerView === "upload" && workspace ? (
                <div className="space-y-3">
                  <Label className="text-zinc-700 dark:text-zinc-300">Upload from your device</Label>
                  <MediaLocalDropzone
                    key={mediaUploadPaneNonce}
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
                            const prepared = await prepareFileForUpload(file);
                            const dataUrl = await fileToDataUrl(prepared);
                            const mediaType: MediaType = prepared.type.startsWith("video/") ? "Video" : "Image";
                            const { mediaUrl, mediaType: uploadedMediaType } = workspace.cloudinaryUploadsReady
                              ? await apiUploadMediaToCloudinary({
                                  dataUrl,
                                  fileName: prepared.name,
                                  mediaType,
                                })
                              : await apiUploadMediaLocal({
                                  dataUrl,
                                  fileName: prepared.name,
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
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">Browsing workspace files — upload new anytime.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => {
                        setMediaPickerView("upload");
                        setMediaUploadPaneNonce((n) => n + 1);
                      }}
                    >
                      Upload from computer
                    </Button>
                  </div>
                  <Label>Choose saved media</Label>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Scroll sideways (~3 tiles) — tap one to attach. Carousel is first-slide URL only.
                  </p>
                  {mediaLibrary.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      No media in this workspace yet. Use &quot;From computer&quot; or the button above to upload.
                    </p>
                  ) : (
                    <div
                      role="list"
                      className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain pb-2 pt-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
                    >
                      {mediaLibrary.slice(0, 48).map((asset) => {
                        const locked = usedMediaByOtherItems.has(asset.mediaUrl);
                        return (
                          <div
                            key={`approval-picker-${asset.id}`}
                            role="listitem"
                            className="w-[148px] shrink-0 snap-start rounded-xl border border-zinc-200 bg-white p-2 sm:w-[160px] dark:border-zinc-700 dark:bg-zinc-900/80"
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
