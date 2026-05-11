"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyTimePresetInZone,
  effectiveContentTimeZone,
  formatInstantInZone,
  toDateTimeLocalInZone,
  zonedLocalToUtcIso,
} from "@/lib/workspace-datetime";
import { Calendar, ChevronDown, ChevronUp, Clock, Images, MoreHorizontal, Plus, Sparkles, Trash2 } from "lucide-react";
import { ContentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { requestAiCompletionNotifyPreference } from "@/components/ai-completion-notify-bridge";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaPreviewBlock } from "@/components/media-preview-block";
import { MediaLocalDropzone } from "@/components/media-local-dropzone";
import { SocialPostPreview } from "@/components/social-post-preview";
import { apiErrorMessage, apiUploadMediaLocal, apiUploadMediaToCloudinary, sanitizeMediaUrl } from "@/lib/api";
import { isWorkspaceLibraryMediaUrl, normalizeApiMediaType, shouldUseVideoElement } from "@/lib/media-detect";
import { isPlatformConnected, platformLabel } from "@/lib/platform";
import type { ContentItem, MediaType, PublishingPlatform } from "@/lib/types";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";
import { useElapsedSecondsWhileActive, useSimulatedAiProgress } from "@/hooks/use-simulated-ai-progress";

function formatElapsedSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

const APPROVAL_PLATFORM_OPTIONS = [
  { id: "linkedin", disabled: false },
  { id: "instagram", disabled: false },
  { id: "facebook", disabled: false },
  { id: "twitter", disabled: false },
] as const;
const ACTIVE_APPROVAL_PLATFORMS = APPROVAL_PLATFORM_OPTIONS.filter((platform) => !platform.disabled).map((platform) => platform.id);

const TIME_OPTIONS = [
  { label: "Now + 30 min", value: "30m" },
  { label: "Now + 1 hour", value: "1h" },
  { label: "Now + 2 hours", value: "2h" },
  { label: "Tomorrow 09:00", value: "tomorrow-9am" },
  { label: "Tomorrow 18:00", value: "tomorrow-6pm" },
] as const;

const LIBRARY_PAGE_SIZE_OPTIONS = [8, 12] as const;

function LibraryThumb({
  url,
  mediaType,
  size = "sm",
}: {
  url: string;
  mediaType: MediaType;
  size?: "sm" | "lg";
}) {
  const safe = sanitizeMediaUrl(url);
  const useVideo = Boolean(safe && shouldUseVideoElement(safe, mediaType));
  const shell = cn(
    "shrink-0 overflow-hidden border border-zinc-200/80 bg-zinc-100",
    size === "lg"
      ? "h-[4.75rem] w-[4.75rem] rounded-xl sm:h-[6.25rem] sm:w-[6.25rem]"
      : "h-11 w-11 rounded-md",
  );
  const videoFallback = mediaType === "Video" && !useVideo;
  if (!safe) {
    return <div className={shell} aria-hidden />;
  }
  return (
    <div className="relative shrink-0">
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

export function ContentWorkspaceView() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const generateContent = useWorkspaceStore((s) => s.generateContent);
  const suggestMasterContent = useWorkspaceStore((s) => s.suggestMasterContent);
  const createContentItem = useWorkspaceStore((s) => s.createContentItem);
  const approve = useWorkspaceStore((s) => s.approve);
  const reject = useWorkspaceStore((s) => s.reject);
  const updateContentItem = useWorkspaceStore((s) => s.updateContentItem);
  const deleteContentItem = useWorkspaceStore((s) => s.deleteContentItem);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const publish = useWorkspaceStore((s) => s.publish);
  const { push } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approveTargetId, setApproveTargetId] = useState<string | null>(null);
  const [calendarDays, setCalendarDays] = useState(10);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newTimePreset, setNewTimePreset] = useState("");
  const [newMediaPreview, setNewMediaPreview] = useState("");
  const [newScheduledAt, setNewScheduledAt] = useState("");
  const [newAutoActivate, setNewAutoActivate] = useState(true);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftTimePreset, setDraftTimePreset] = useState("");
  const [draftMediaPreview, setDraftMediaPreview] = useState("");
  const [draftScheduledAt, setDraftScheduledAt] = useState("");
  const [draftAutoActivate, setDraftAutoActivate] = useState(false);
  const [approvePlatforms, setApprovePlatforms] = useState<PublishingPlatform[]>([]);
  const [approvingTargets, setApprovingTargets] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<"create" | "edit">("create");
  const [mediaPickerView, setMediaPickerView] = useState<"upload" | "library">("upload");
  const [suggestHint, setSuggestHint] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [newMediaType, setNewMediaType] = useState<MediaType>("Image");
  const [draftMediaType, setDraftMediaType] = useState<MediaType>("Image");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ContentItem | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [libraryPageSize, setLibraryPageSize] = useState<number>(12);
  const [libraryPage, setLibraryPage] = useState(0);
  const [manualCreateOpen, setManualCreateOpen] = useState(false);
  const [postNowOpen, setPostNowOpen] = useState(false);
  const [postNowWorking, setPostNowWorking] = useState(false);
  const [postNowTarget, setPostNowTarget] = useState<"manual-create" | "edit" | null>(null);
  const [postNowPlatforms, setPostNowPlatforms] = useState<PublishingPlatform[]>(["linkedin"]);
  const [postNowEditId, setPostNowEditId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const prevAutoActivateRef = useRef(newAutoActivate);

  const createElapsedSec = useElapsedSecondsWhileActive(creating);
  const suggestElapsedSec = useElapsedSecondsWhileActive(suggesting);
  const createProgressPct = useSimulatedAiProgress(creating);
  const suggestProgressPct = useSimulatedAiProgress(suggesting);
  const postNowElapsedSec = useElapsedSecondsWhileActive(postNowWorking);
  const postNowProgressPct = useSimulatedAiProgress(postNowWorking);
  const manualCreateJobActive = creating || suggesting;

  const content = useMemo(() => workspace?.content ?? [], [workspace]);
  const contentTimeZone = useMemo(
    () => effectiveContentTimeZone(workspace?.profile?.timezone, workspace?.primaryRegion),
    [workspace?.profile?.timezone, workspace?.primaryRegion],
  );
  const uniqueMedia = new Set(content.map((item) => item.mediaPreview));
  const activeItem = useMemo(() => content.find((item) => item.id === editingId) ?? null, [content, editingId]);
  const approveTargetItem = useMemo(() => content.find((item) => item.id === approveTargetId) ?? null, [content, approveTargetId]);
  const approveAllChecked = approvePlatforms.length === ACTIVE_APPROVAL_PLATFORMS.length;
  const mediaLibrary = useMemo(() => {
    const seen = new Set<string>();
    return (workspace?.mediaLibrary ?? [])
      .filter((asset) => asset.mediaUrl && isWorkspaceLibraryMediaUrl(asset.mediaUrl))
      .filter((asset) => {
        if (seen.has(asset.mediaUrl)) return false;
        seen.add(asset.mediaUrl);
        return true;
      })
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        type: asset.mediaType,
        url: asset.mediaUrl,
        createdAt: asset.createdAt,
      }));
  }, [workspace?.mediaLibrary]);
  const usedMediaByOtherItems = useMemo(() => {
    const rows = mediaPickerTarget === "edit" && activeItem ? content.filter((item) => item.id !== activeItem.id) : content;
    return new Set(rows.map((item) => item.mediaPreview).filter(Boolean));
  }, [activeItem, content, mediaPickerTarget]);

  const libraryTotalPages = Math.max(1, Math.ceil(content.length / libraryPageSize));
  const effectiveLibraryPage = Math.min(libraryPage, libraryTotalPages - 1);
  const librarySliceStart = effectiveLibraryPage * libraryPageSize;
  const librarySlice = content.slice(librarySliceStart, librarySliceStart + libraryPageSize);

  useEffect(() => {
    if (newAutoActivate && !prevAutoActivateRef.current) setScheduleOpen(true);
    prevAutoActivateRef.current = newAutoActivate;
  }, [newAutoActivate]);

  const applySelectedMedia = (asset: { url: string; type: MediaType }) => {
    if (mediaPickerTarget === "create") {
      setNewMediaPreview(asset.url);
      setNewMediaType(asset.type);
      return;
    }
    setDraftMediaPreview(asset.url);
    setDraftMediaType(asset.type);
  };

  const openMediaPicker = (target: "create" | "edit") => {
    setMediaPickerTarget(target);
    setMediaPickerView("upload");
    setMediaPickerOpen(true);
  };

  if (shellPending) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  const connectedPostNowPlatforms = APPROVAL_PLATFORM_OPTIONS
    .filter((o) => !o.disabled && isPlatformConnected(workspace.integrations, o.id))
    .map((o) => o.id as PublishingPlatform);

  const openPostNow = (target: "manual-create" | "edit", itemId?: string) => {
    const preferred = workspace.preferences.defaultPlatform;
    const initial = connectedPostNowPlatforms.includes(preferred) ? [preferred] : connectedPostNowPlatforms.slice(0, 1);
    setPostNowPlatforms(initial);
    setPostNowTarget(target);
    if (target === "edit") {
      const id = itemId ?? activeItem?.id ?? null;
      setPostNowEditId(id);
    } else {
      setPostNowEditId(null);
    }
    setPostNowOpen(true);
  };

  const confirmPostNow = async () => {
    const nowIso = new Date().toISOString();
    const selectedPlatforms = postNowPlatforms.filter((p) => connectedPostNowPlatforms.includes(p));
    if (selectedPlatforms.length === 0) {
      push("Please select at least one connected platform.");
      return;
    }
    setPostNowWorking(true);
    try {
      if (postNowTarget === "manual-create") {
        if (!newMediaPreview) {
          push("Please include at least one media file.");
          return;
        }
        if (!newTitle.trim() || !newText.trim()) {
          push("Title and body are required.");
          return;
        }
        const id = await createContentItem({
          title: newTitle.trim(),
          contentText: newText.trim(),
          mediaType: newMediaType,
          mediaPreview: newMediaPreview,
          scheduledAt: nowIso,
          autoActivate: true,
          selectedPlatform: selectedPlatforms[0],
        });
        if (id) {
          const approvedIds = await approve(id, selectedPlatforms);
          const res = await publish(approvedIds);
          if (res.published > 0) {
            push(`Published to ${selectedPlatforms.map((p) => platformLabel(p)).join(", ")}`);
            setNewTitle("");
            setNewText("");
            setNewMediaPreview("");
            setNewMediaType("Image");
            setNewScheduledAt("");
            setNewTimePreset("");
            setManualCreateOpen(false);
          } else {
            push(res.warnings[0] ?? "Publish did not complete");
          }
        } else {
          push("Draft was saved but could not publish automatically. Use Pipeline to publish.");
        }
      } else if (postNowTarget === "edit" && postNowEditId) {
        if (!draftMediaPreview) {
          push("Please include media before posting.");
          return;
        }
        await updateContentItem({
          contentId: postNowEditId,
          title: draftTitle,
          contentText: draftText,
          mediaType: draftMediaType,
          mediaPreview: draftMediaPreview,
          scheduledAt: nowIso,
          autoActivate: true,
          selectedPlatform: selectedPlatforms[0],
        });
        const approvedIds = await approve(postNowEditId, selectedPlatforms);
        const res = await publish(approvedIds);
        if (res.published > 0) {
          push(`Published to ${selectedPlatforms.map((p) => platformLabel(p)).join(", ")}`);
          setEditingId(null);
          setDetailItem(null);
        } else {
          push(res.warnings[0] ?? "Publish did not complete");
        }
      }
      setPostNowOpen(false);
      setPostNowTarget(null);
      setPostNowEditId(null);
    } catch (e) {
      push(apiErrorMessage(e));
    } finally {
      setPostNowWorking(false);
    }
  };

  const previewAuthor = workspace.companyName?.trim() || workspace.profile?.company?.trim() || workspace.profile?.name?.trim() || "Workspace";

  return (
    <div className="w-full min-w-0 space-y-4 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Content</p>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Compose and library</h1>
          <p className="text-xs text-zinc-500">Generate calendar drafts, then review and schedule below.</p>
        </div>
        <Button type="button" className="shrink-0 rounded-xl" onClick={() => setManualCreateOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Add content
        </Button>
      </div>

      <Dialog open={manualCreateOpen} onOpenChange={setManualCreateOpen}>
        <DialogContent
          className={cn(
            "flex h-[100dvh] max-h-[100dvh] w-full max-w-md flex-col gap-0 overflow-hidden bg-white p-0 dark:bg-zinc-950 sm:max-w-lg",
            "!fixed !top-0 !bottom-0 !left-auto !right-0 !translate-x-0 !translate-y-0",
            "rounded-none rounded-l-2xl border border-l border-y-0 border-r-0 sm:border-l",
          )}
        >
          <div className="shrink-0 space-y-1 border-b border-zinc-100 px-5 py-4 pr-14 text-left">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">Compose</p>
            <DialogTitle className="text-base font-semibold tracking-tight text-zinc-900">Manual create</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              One flow: copy, then tap Media and Publish time to attach and schedule. AI uses your selected model.
            </DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50/40 p-2.5 sm:flex-row sm:items-end sm:gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="suggest-hint" className="text-xs text-zinc-600">
                  Optional focus (AI)
                </Label>
                <Input
                  id="suggest-hint"
                  value={suggestHint}
                  onChange={(e) => setSuggestHint(e.target.value)}
                  placeholder="e.g. product launch, customer story…"
                  className="h-9 bg-white text-sm"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 shrink-0 rounded-lg"
                disabled={suggesting || !workspace.companyName?.trim()}
                onClick={() => {
                  setSuggesting(true);
                  void suggestMasterContent(suggestHint)
                    .then((s) => {
                      setNewTitle(s.title);
                      setNewText(s.content_text);
                      const media = sanitizeMediaUrl(s.media_preview);
                      setNewMediaPreview(media);
                      setNewMediaType(normalizeApiMediaType(s.media_type, "Image"));
                      if (!media) {
                        push("AI returned no media URL. Open Media and pick or upload a file.");
                        setMediaOpen(true);
                        return;
                      }
                      push("AI filled title, copy, and media. Adjust time, then create.");
                    })
                    .catch((e: Error) => {
                      push(e.message);
                    })
                    .finally(() => setSuggesting(false));
                }}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5 opacity-80" />
                {suggesting ? `Working… ${formatElapsedSec(suggestElapsedSec)}` : "AI suggest"}
              </Button>
            </div>
            {!workspace.companyName?.trim() ? (
              <p className="text-[11px] text-amber-800">Set company name in workspace setup to enable AI suggest.</p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="new-title" className="text-xs text-zinc-600">
                Title
              </Label>
              <Input
                id="new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Launch campaign insight post"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-text" className="text-xs text-zinc-600">
                Post copy
              </Label>
              <Textarea
                id="new-text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className="min-h-[7rem] resize-y text-sm"
                placeholder="Write caption / body…"
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-50/60">
              <button
                type="button"
                onClick={() => setMediaOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-100/70"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Images className="size-4 shrink-0 text-zinc-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Media</p>
                    <p className="truncate text-sm text-zinc-900">
                      {newMediaPreview.trim()
                        ? `${newMediaType} · tap to change or preview`
                        : "Tap to upload, pick from library, or set asset type"}
                    </p>
                  </div>
                </div>
                {mediaOpen ? (
                  <ChevronUp className="size-4 shrink-0 text-zinc-400" aria-hidden />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-zinc-400" aria-hidden />
                )}
              </button>
              {mediaOpen ? (
                <div className="space-y-3 border-t border-zinc-200/80 bg-white px-3 py-3">
                  <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-media-type" className="text-xs text-zinc-600">
                        Asset type
                      </Label>
                      <select
                        id="new-media-type"
                        value={newMediaType}
                        onChange={(e) => setNewMediaType(e.target.value as MediaType)}
                        className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                      >
                        <option value="Image">Image</option>
                        <option value="Video">Video</option>
                        <option value="Carousel">Carousel (cover URL)</option>
                      </select>
                    </div>
                    <Button type="button" variant="secondary" size="sm" className="h-9 rounded-lg" onClick={() => openMediaPicker("create")}>
                      Upload or choose
                    </Button>
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-500">
                    Uploads stay on this workspace storage. Match type to the asset for accurate in-feed previews.
                  </p>
                  {newMediaPreview ? (
                    <div className="space-y-2 rounded-lg border border-zinc-200 p-2">
                      <p className="text-[11px] font-medium text-zinc-600">Feed preview ({workspace.preferences.defaultPlatform})</p>
                      <SocialPostPreview
                        platform={workspace.preferences.defaultPlatform}
                        authorName={previewAuthor}
                        title={newTitle.trim() || "Draft title"}
                        body={newText.trim() || "Caption preview…"}
                        mediaUrl={newMediaPreview}
                        mediaType={newMediaType}
                        compact
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-md text-xs"
                        onClick={() => {
                          setNewMediaPreview("");
                          setNewMediaType("Image");
                        }}
                      >
                        Remove media
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-3 py-5 text-center text-xs text-zinc-500">
                      No media yet — use Upload or choose.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-50/60">
              <button
                type="button"
                onClick={() => setScheduleOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-100/70"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Clock className="size-4 shrink-0 text-zinc-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Publish time</p>
                    <p className="truncate text-sm text-zinc-900">
                      {newScheduledAt.trim()
                        ? formatInstantInZone(zonedLocalToUtcIso(newScheduledAt, contentTimeZone), contentTimeZone)
                        : "Tap to set date, time, or a quick preset"}
                    </p>
                  </div>
                </div>
                {scheduleOpen ? (
                  <ChevronUp className="size-4 shrink-0 text-zinc-400" aria-hidden />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-zinc-400" aria-hidden />
                )}
              </button>
              {scheduleOpen ? (
                <div className="space-y-3 border-t border-zinc-200/80 bg-white px-3 py-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-time" className="text-xs text-zinc-600">
                        Date and time
                      </Label>
                      <Input
                        id="new-time"
                        type="datetime-local"
                        value={newScheduledAt}
                        onChange={(e) => setNewScheduledAt(e.target.value)}
                        className="h-9 text-sm"
                      />
                      <p className="text-[11px] leading-snug text-zinc-500">Zone: {contentTimeZone}. “Tomorrow” presets use this calendar.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-time-option" className="text-xs text-zinc-600">
                        Quick preset
                      </Label>
                      <select
                        id="new-time-option"
                        value={newTimePreset}
                        onChange={(e) => {
                          const selected = e.target.value;
                          setNewTimePreset(selected);
                          if (!selected) return;
                          setNewScheduledAt(toDateTimeLocalInZone(applyTimePresetInZone(selected, contentTimeZone), contentTimeZone));
                        }}
                        className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                      >
                        <option value="">Select preset</option>
                        {TIME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-full rounded-lg border-emerald-200/90 bg-emerald-50/50 text-emerald-900 hover:bg-emerald-100/80 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
                    disabled={!newTitle.trim() || !newText.trim() || !newMediaPreview}
                    onClick={() => openPostNow("manual-create")}
                  >
                    Post now…
                  </Button>
                  <p className="text-[11px] leading-snug text-zinc-500">
                    Post now sets time to the current moment, asks which channel to use, saves the draft, then publishes immediately if your integration is connected.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          </div>

          {manualCreateJobActive ? (
            <div
              className="shrink-0 space-y-1.5 border-t border-zinc-200/80 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/60"
              role="status"
              aria-live="polite"
              aria-label={creating ? "Creating content" : "AI suggest in progress"}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                <span>{creating ? "Creating content…" : "AI suggest running…"}</span>
                <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatElapsedSec(creating ? createElapsedSec : suggestElapsedSec)}
                </span>
              </div>
              <div
                className="h-1 w-full overflow-hidden rounded-full bg-zinc-200/90 dark:bg-zinc-800"
                role="progressbar"
                aria-valuenow={creating ? createProgressPct : suggestProgressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Estimated progress ${creating ? createProgressPct : suggestProgressPct} percent`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 transition-[width] duration-300 ease-out"
                  style={{ width: `${creating ? createProgressPct : suggestProgressPct}%` }}
                />
              </div>
              <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                Bar is estimated until the request finishes (not streamed from the server).
              </p>
            </div>
          ) : null}

          <div className="shrink-0 space-y-2 border-t border-zinc-200/80 bg-zinc-50/90 px-5 py-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/80">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="rounded border-zinc-300 text-zinc-900"
                checked={newAutoActivate}
                onChange={(e) => setNewAutoActivate(e.target.checked)}
              />
              Auto approve + schedule (default platform)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 rounded-md"
                onClick={() => {
                  setScheduleOpen(true);
                  setNewTimePreset("1h");
                  setNewScheduledAt(toDateTimeLocalInZone(applyTimePresetInZone("1h", contentTimeZone), contentTimeZone));
                }}
              >
                Auto time (+1h)
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-md"
                disabled={creating || !newTitle.trim() || !newText.trim()}
                onClick={() => {
                  if (!newMediaPreview) {
                    push("Please include at least one media file.");
                    setMediaOpen(true);
                    return;
                  }
                  if (newAutoActivate && !newScheduledAt) {
                    push("Please select publish time before auto activate.");
                    setScheduleOpen(true);
                    return;
                  }
                  setCreating(true);
                  void createContentItem({
                    title: newTitle.trim(),
                    contentText: newText.trim(),
                    mediaType: newMediaType,
                    mediaPreview: newMediaPreview,
                    scheduledAt: newScheduledAt ? zonedLocalToUtcIso(newScheduledAt, contentTimeZone) : undefined,
                    autoActivate: newAutoActivate,
                  })
                    .then(() => {
                      push("Content created");
                      setNewTitle("");
                      setNewText("");
                      setNewMediaPreview("");
                      setNewMediaType("Image");
                      setNewScheduledAt("");
                      setNewTimePreset("");
                      setManualCreateOpen(false);
                    })
                    .catch((err: unknown) => push(err instanceof Error ? err.message : "Create failed"))
                    .finally(() => setCreating(false));
                }}
              >
                {creating ? `Creating… ${formatElapsedSec(createElapsedSec)}` : "Create content"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={postNowOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPostNowOpen(false);
            setPostNowTarget(null);
            setPostNowEditId(null);
            setPostNowWorking(false);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader className="text-left">
            <DialogTitle>Post now</DialogTitle>
            <DialogDescription>
              Choose one or more channels. We stamp the current time, save the draft, then publish immediately to selected connected platforms.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-1">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="text-zinc-900"
                checked={
                  connectedPostNowPlatforms.length > 0 &&
                  connectedPostNowPlatforms.every((platform) => postNowPlatforms.includes(platform))
                }
                onChange={(e) => setPostNowPlatforms(e.target.checked ? [...connectedPostNowPlatforms] : [])}
              />
              <span className="font-medium">All connected platforms</span>
            </label>
            {APPROVAL_PLATFORM_OPTIONS.filter((o) => !o.disabled).map((option) => {
              const connected = isPlatformConnected(workspace.integrations, option.id);
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                    connected ? "border-zinc-200 bg-zinc-50" : "cursor-not-allowed border-zinc-100 bg-zinc-100/80 text-zinc-500",
                  )}
                >
                  <input
                    type="checkbox"
                    className="text-zinc-900"
                    checked={postNowPlatforms.includes(option.id as PublishingPlatform)}
                    disabled={!connected}
                    onChange={() =>
                      setPostNowPlatforms((current) =>
                        current.includes(option.id as PublishingPlatform)
                          ? current.filter((id) => id !== option.id)
                          : [...current, option.id as PublishingPlatform],
                      )
                    }
                  />
                  <span className="font-medium">{platformLabel(option.id)}</span>
                  {!connected ? <span className="text-xs">(not connected)</span> : null}
                </label>
              );
            })}
          </div>
          {postNowWorking ? (
            <div className="space-y-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-700">
                <span>Publishing…</span>
                <span className="tabular-nums text-zinc-500">{formatElapsedSec(postNowElapsedSec)}</span>
              </div>
              <div
                className="h-1 w-full overflow-hidden rounded-full bg-zinc-200/90"
                role="progressbar"
                aria-valuenow={postNowProgressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-[width] duration-300 ease-out"
                  style={{ width: `${postNowProgressPct}%` }}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              disabled={postNowWorking}
              onClick={() => setPostNowOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" disabled={postNowWorking} onClick={() => void confirmPostNow()}>
              {postNowWorking ? `Working… ${formatElapsedSec(postNowElapsedSec)}` : "Publish now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-zinc-200/70 bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">Calendar</p>
            <p className="text-sm font-semibold text-zinc-900">Content engine</p>
            <p className="text-[11px] text-zinc-500">7–30 day runs · prefer unique media per slot</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex flex-wrap gap-1 rounded-md border border-zinc-200/80 bg-zinc-50 p-0.5">
              {[7, 10, 14, 21, 30].map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant={calendarDays === days ? "default" : "ghost"}
                  className={cn("h-7 rounded-[5px] px-2.5 text-xs", calendarDays !== days && "text-zinc-600 hover:bg-white")}
                  onClick={() => setCalendarDays(days)}
                >
                  {days}d
                </Button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-md px-3 text-xs"
              onClick={() => {
                void (async () => {
                  try {
                    const notify = await requestAiCompletionNotifyPreference("content");
                    await generateContent(calendarDays, { completionNotify: notify });
                    push(`Generated ${calendarDays}-day content calendar`);
                  } catch (e) {
                    push(apiErrorMessage(e), { kind: "error" });
                  }
                })();
              }}
            >
              Regenerate
            </Button>
            <span className="text-[11px] tabular-nums text-zinc-500">
              {uniqueMedia.size}/{content.length} unique media
            </span>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/60 pb-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Library</h2>
            <p className="text-xs text-zinc-500">Clean cards with larger actions · {libraryPageSize} items per page</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="library-page-size" className="text-xs text-zinc-500">
              Per page
            </Label>
            <select
              id="library-page-size"
              value={libraryPageSize}
              onChange={(e) => {
                setLibraryPageSize(Number(e.target.value));
                setLibraryPage(0);
              }}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            >
              {LIBRARY_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
        {content.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200/80 bg-zinc-50/50 py-12 text-center text-xs text-zinc-500">
            No drafts yet — compose above or regenerate the calendar.
          </div>
        ) : (
          <>
            {content.length > libraryPageSize ? (
              <div className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/30">
                <div />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-xl px-4 text-sm font-medium"
                    disabled={effectiveLibraryPage <= 0}
                    onClick={() => setLibraryPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <p className="min-w-[5.5rem] text-center text-xs tabular-nums text-zinc-500">
                    Page {effectiveLibraryPage + 1} / {libraryTotalPages}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-xl px-4 text-sm font-medium"
                    disabled={effectiveLibraryPage >= libraryTotalPages - 1}
                    onClick={() => setLibraryPage((p) => Math.min(libraryTotalPages - 1, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3">
              {librarySlice.map((item) => {
                const feedPlatform = item.selectedPlatform ?? workspace.preferences.defaultPlatform;
                const scheduledLabel = item.scheduledAt ? formatInstantInZone(item.scheduledAt, contentTimeZone) : null;
                const createdLabel = item.createdAt ? formatInstantInZone(item.createdAt, contentTimeZone) : null;
                const updatedLabel = item.updatedAt ? formatInstantInZone(item.updatedAt, contentTimeZone) : null;
                const bodyOneLine = item.contentText.trim().replace(/\s+/g, " ");
                const bodyPreview = bodyOneLine.length > 140 ? `${bodyOneLine.slice(0, 140)}…` : bodyOneLine;
                const hoverSummary = [
                  item.title,
                  scheduledLabel ? `Publish: ${scheduledLabel}` : "Publish: not scheduled",
                  `Status: ${item.status}`,
                  createdLabel ? `Added: ${createdLabel}` : null,
                  updatedLabel && updatedLabel !== createdLabel ? `Updated: ${updatedLabel}` : null,
                  `${platformLabel(feedPlatform)} · ${item.mediaType}`,
                  bodyOneLine ? `Copy: ${bodyOneLine.length > 280 ? `${bodyOneLine.slice(0, 280)}…` : bodyOneLine}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <article
                    key={item.id}
                    title={hoverSummary}
                    onClick={() => setDetailItem(item)}
                    className="flex min-h-[17rem] h-full min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm outline-none transition-[box-shadow,border-color] hover:border-zinc-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 sm:flex-row sm:items-stretch"
                    aria-label={`Open details: ${item.title}`}
                  >
                    <div
                      className="shrink-0 self-start rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                    >
                      <LibraryThumb url={item.mediaPreview} mediaType={item.mediaType} size="lg" />
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="line-clamp-2 min-w-0 flex-1 text-left text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                          {item.title}
                        </h3>
                        <ContentStatusBadge status={item.status} />
                      </div>
                      <div className="space-y-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <Calendar className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">Publish</span>
                          <span className="tabular-nums">{scheduledLabel ?? "Not scheduled"}</span>
                        </p>
                        {createdLabel ? (
                          <p className="flex flex-wrap items-center gap-1.5 pl-[1.375rem]">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">Added</span>
                            <span className="tabular-nums">{createdLabel}</span>
                            {updatedLabel && updatedLabel !== createdLabel ? (
                              <>
                                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">Updated</span>
                                <span className="tabular-nums">{updatedLabel}</span>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        <p className="flex flex-wrap items-center gap-1.5">
                          <Clock className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
                          <span>
                            {platformLabel(feedPlatform)} · {item.mediaType}
                          </span>
                        </p>
                      </div>
                      {bodyPreview ? (
                        <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">{bodyPreview}</p>
                      ) : (
                        <p className="text-xs italic text-zinc-400">No caption</p>
                      )}
                      <div
                        className="mt-auto flex flex-wrap items-center gap-2 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="h-9 rounded-xl bg-zinc-900 px-3.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                          onClick={() => setDetailItem(item)}
                        >
                          View
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-xl border-emerald-200 bg-emerald-50 px-3.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                          disabled={item.status === "PUBLISHED"}
                          onClick={() => {
                            setDraftTitle(item.title);
                            setDraftText(item.contentText);
                            setDraftMediaPreview(item.mediaPreview);
                            setDraftMediaType(item.mediaType);
                            openPostNow("edit", item.id);
                          }}
                        >
                          Post now
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 w-9 rounded-xl border-zinc-200 p-0 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                              aria-label={`More actions: ${item.title}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48 rounded-xl">
                            <DropdownMenuItem className="rounded-lg" onSelect={() => setDetailItem(item)}>
                              Open details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-lg"
                              onSelect={() => {
                                setEditingId(item.id);
                                setDraftTitle(item.title);
                                setDraftText(item.contentText);
                                setDraftMediaPreview(item.mediaPreview);
                                setDraftMediaType(item.mediaType);
                                setDraftScheduledAt(toDateTimeLocalInZone(item.scheduledAt, contentTimeZone));
                                setDraftTimePreset("");
                                setDraftAutoActivate(item.status === "APPROVED" || item.status === "SCHEDULED");
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-lg"
                              disabled={item.status === "PUBLISHED"}
                              onSelect={() => {
                                const row = content.find((c) => c.id === item.id);
                                if (!row) return;
                                setApproveTargetId(item.id);
                                setApprovePlatforms(row.selectedPlatform ? [row.selectedPlatform] : []);
                              }}
                            >
                              Approve for platforms…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="rounded-lg text-red-600 focus:text-red-600"
                              onSelect={() => setDeleteTargetId(item.id)}
                            >
                              <Trash2 className="mr-2 size-3.5 opacity-80" aria-hidden />
                              Delete
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-lg text-amber-700 focus:text-amber-800"
                              disabled={item.status === "PUBLISHED"}
                              onSelect={() => void reject(item.id).then(() => push("Content rejected"))}
                            >
                              Reject (keep)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {content.length > libraryPageSize ? (
              <div className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/30">
                <div />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-xl px-4 text-sm font-medium"
                    disabled={effectiveLibraryPage <= 0}
                    onClick={() => setLibraryPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <p className="min-w-[5.5rem] text-center text-xs tabular-nums text-zinc-500">
                    Page {effectiveLibraryPage + 1} / {libraryTotalPages}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-xl px-4 text-sm font-medium"
                    disabled={effectiveLibraryPage >= libraryTotalPages - 1}
                    onClick={() => setLibraryPage((p) => Math.min(libraryTotalPages - 1, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Dialog
        open={Boolean(detailItem)}
        onOpenChange={(o) => {
          if (!o) setDetailItem(null);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
          {detailItem ? (
            <>
              <DialogHeader className="space-y-1 border-b border-zinc-100 px-6 pb-4 pt-6 text-left dark:border-zinc-800">
                <DialogTitle className="text-base leading-snug">{detailItem.title}</DialogTitle>
                <DialogDescription className="text-xs text-zinc-500">
                  {detailItem.mediaType}
                  {detailItem.selectedPlatform ? <> · {platformLabel(detailItem.selectedPlatform)}</> : null}
                  {detailItem.scheduledAt ? <> · Publish {formatInstantInZone(detailItem.scheduledAt, contentTimeZone)}</> : null}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[min(58vh,520px)] space-y-3 overflow-y-auto px-6 py-4 text-sm">
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Feed preview</p>
                  <SocialPostPreview
                    platform={detailItem.selectedPlatform ?? workspace.preferences.defaultPlatform}
                    authorName={previewAuthor}
                    title={detailItem.title}
                    body={detailItem.contentText}
                    mediaUrl={detailItem.mediaPreview}
                    mediaType={detailItem.mediaType}
                  />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-[11px] text-zinc-700">
                  <dt className="text-zinc-500">Status</dt>
                  <dd className="font-medium capitalize">{detailItem.status.toLowerCase()}</dd>
                  <dt className="text-zinc-500">Publish slot</dt>
                  <dd>{detailItem.scheduledAt ? formatInstantInZone(detailItem.scheduledAt, contentTimeZone) : "—"}</dd>
                  <dt className="text-zinc-500">Added</dt>
                  <dd>{detailItem.createdAt ? formatInstantInZone(detailItem.createdAt, contentTimeZone) : "—"}</dd>
                  <dt className="text-zinc-500">Last updated</dt>
                  <dd>{detailItem.updatedAt ? formatInstantInZone(detailItem.updatedAt, contentTimeZone) : "—"}</dd>
                  <dt className="text-zinc-500">Internal ID</dt>
                  <dd className="font-mono text-[10px] text-zinc-600">{detailItem.id}</dd>
                </dl>
                {/* <div>
                  <p className="mb-1 text-[11px] font-medium text-zinc-500">Full copy</p>
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-100 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-800">
                    {detailItem.contentText}
                  </p>
                </div> */}
              </div>
              <DialogFooter className="border-t border-zinc-100 bg-white/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/95 sm:justify-between">
                <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={() => setDetailItem(null)}>
                  Close
                </Button>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-8 w-8 rounded-lg p-0">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 rounded-xl">
                      <DropdownMenuItem
                        className="rounded-lg text-amber-700 focus:text-amber-800"
                        disabled={detailItem.status === "PUBLISHED"}
                        onSelect={() => {
                          const id = detailItem.id;
                          void reject(id).then(() => {
                            push("Content rejected");
                            setDetailItem(null);
                          });
                        }}
                      >
                        Reject (keep)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="rounded-lg text-red-600 focus:text-red-600"
                        onSelect={() => setDeleteTargetId(detailItem.id)}
                      >
                        <Trash2 className="mr-2 size-3.5 opacity-80" aria-hidden />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => {
                      const id = detailItem.id;
                      setDetailItem(null);
                      const row = content.find((c) => c.id === id);
                      if (!row) return;
                      setEditingId(row.id);
                      setDraftTitle(row.title);
                      setDraftText(row.contentText);
                      setDraftMediaPreview(row.mediaPreview);
                      setDraftMediaType(row.mediaType);
                      setDraftScheduledAt(toDateTimeLocalInZone(row.scheduledAt, contentTimeZone));
                      setDraftTimePreset("");
                      setDraftAutoActivate(row.status === "APPROVED" || row.status === "SCHEDULED");
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => {
                      const id = detailItem.id;
                      setDetailItem(null);
                      setApproveTargetId(id);
                      const row = content.find((c) => c.id === id);
                      setApprovePlatforms(row?.selectedPlatform ? [row.selectedPlatform] : []);
                    }}
                  >
                    Approve for platforms…
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTargetId)} onOpenChange={(o) => !o && !deleting && setDeleteTargetId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>
              This removes the post from your library. Published history in analytics may be orphaned; prefer delete before publish when possible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="ghost" className="rounded-xl" disabled={deleting} onClick={() => setDeleteTargetId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={deleting}
              onClick={() => {
                if (!deleteTargetId) return;
                setDeleting(true);
                void deleteContentItem(deleteTargetId)
                  .then(() => {
                    push("Content deleted");
                    if (detailItem?.id === deleteTargetId) setDetailItem(null);
                    if (editingId === deleteTargetId) setEditingId(null);
                    setDeleteTargetId(null);
                  })
                  .catch((err: unknown) => push(err instanceof Error ? err.message : "Delete failed"))
                  .finally(() => setDeleting(false));
              }}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeItem && (
        <Dialog open={Boolean(activeItem)} onOpenChange={(o) => !o && setEditingId(null)}>
          <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="space-y-1 border-b border-zinc-100 px-6 pb-4 pt-6 text-left dark:border-zinc-800">
              <DialogTitle>Edit content</DialogTitle>
              <DialogDescription>Update copy, media, and schedule. Times use {contentTimeZone}.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(56vh,500px)] space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-body">Body</Label>
                <Textarea id="edit-body" value={draftText} onChange={(e) => setDraftText(e.target.value)} className="min-h-28 rounded-xl" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
                <div>
                  <Label htmlFor="edit-media-type" className="text-xs text-zinc-600">
                    Media type
                  </Label>
                  <select
                    id="edit-media-type"
                    value={draftMediaType}
                    onChange={(e) => setDraftMediaType(e.target.value as MediaType)}
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                  >
                    <option value="Image">Image</option>
                    <option value="Video">Video</option>
                    <option value="Carousel">Carousel</option>
                  </select>
                </div>
                <Button type="button" variant="secondary" className="rounded-xl" onClick={() => openMediaPicker("edit")}>
                  Upload or choose media
                </Button>
              </div>
              {draftMediaPreview && (
                <div className="rounded-xl border border-zinc-200 p-2">
                  <div className="h-40 w-full max-w-xl">
                    <MediaPreviewBlock
                      url={draftMediaPreview}
                      mediaType={draftMediaType}
                      className="h-full w-full"
                      videoClassName="h-40"
                      imgClassName="h-40"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 rounded-lg"
                    onClick={() => {
                      setDraftMediaPreview("");
                      setDraftMediaType("Image");
                    }}
                  >
                    Remove selected media
                  </Button>
                </div>
              )}
              <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3">
                <p className="mb-2 text-xs font-medium text-zinc-700">Publish time</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-schedule" className="text-xs text-zinc-600">
                      Date and time
                    </Label>
                    <Input
                      id="edit-schedule"
                      type="datetime-local"
                      value={draftScheduledAt}
                      onChange={(e) => setDraftScheduledAt(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-time-preset" className="text-xs text-zinc-600">
                      Quick preset
                    </Label>
                    <select
                      id="edit-time-preset"
                      value={draftTimePreset}
                      onChange={(e) => {
                        const selected = e.target.value;
                        setDraftTimePreset(selected);
                        if (!selected) return;
                        setDraftScheduledAt(toDateTimeLocalInZone(applyTimePresetInZone(selected, contentTimeZone), contentTimeZone));
                      }}
                      className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    >
                      <option value="">Select time option</option>
                      {TIME_OPTIONS.map((opt) => (
                        <option key={`edit-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={draftAutoActivate} onChange={(e) => setDraftAutoActivate(e.target.checked)} />
                Auto approve + schedule (needs a publish time when enabled)
              </label>
            </div>
            <DialogFooter className="border-t border-zinc-100 bg-white/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/95 sm:justify-between">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-emerald-200/90 bg-emerald-50/50 text-emerald-900 hover:bg-emerald-100/80"
                  disabled={!draftTitle.trim() || !draftText.trim() || !draftMediaPreview}
                  onClick={() => openPostNow("edit")}
                >
                  Post now
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => {
                    if (!draftMediaPreview) {
                      push("Please include at least one media file.");
                      return;
                    }
                    if (draftAutoActivate && !draftScheduledAt.trim()) {
                      push("Please select publish time before auto activate.");
                      return;
                    }
                    void updateContentItem({
                      contentId: activeItem.id,
                      title: draftTitle,
                      contentText: draftText,
                      mediaType: draftMediaType,
                      mediaPreview: draftMediaPreview,
                      scheduledAt: draftScheduledAt.trim()
                        ? zonedLocalToUtcIso(draftScheduledAt.trim(), contentTimeZone)
                        : null,
                      autoActivate: draftAutoActivate,
                    })
                      .then(() => {
                        setEditingId(null);
                        push("Content updated");
                      })
                      .catch((err: unknown) => push(err instanceof Error ? err.message : "Update failed"));
                  }}
                >
                  Save changes
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  onClick={() => {
                    setApproveTargetId(activeItem.id);
                    setApprovePlatforms(activeItem.selectedPlatform ? [activeItem.selectedPlatform] : []);
                    setEditingId(null);
                  }}
                >
                  Approve…
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={Boolean(approveTargetItem)}
        onOpenChange={(o) => {
          if (!o) {
            setApproveTargetId(null);
            setApprovingTargets(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle>Publish targets</DialogTitle>
            <DialogDescription>
              Choose where this post is approved. Facebook and Instagram use the Meta connection; LinkedIn uses its own.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={approveAllChecked}
                onChange={(e) => setApprovePlatforms(e.target.checked ? [...ACTIVE_APPROVAL_PLATFORMS] : [])}
              />
              All available
            </label>
            {APPROVAL_PLATFORM_OPTIONS.map((option) => {
              const connected = isPlatformConnected(workspace.integrations, option.id);
              return (
                <label
                  key={option.id}
                  className="flex flex-col gap-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={approvePlatforms.includes(option.id)}
                      onChange={() =>
                        setApprovePlatforms((current) =>
                          current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id],
                        )
                      }
                    />
                    {platformLabel(option.id)}
                  </span>
                  {!connected ? (
                    <span className="pl-6 text-xs font-normal text-amber-800">
                      Not connected — add credentials in Settings, then try again.
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              disabled={approvingTargets}
              onClick={() => {
                setApproveTargetId(null);
                setApprovingTargets(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={approvingTargets}
              onClick={() => {
                if (!approveTargetItem || approvePlatforms.length === 0) {
                  push("Please select at least one platform.");
                  return;
                }
                const disconnected = approvePlatforms.filter((p) => !isPlatformConnected(workspace.integrations, p));
                if (disconnected.length > 0) {
                  push(`Connect ${disconnected.map((p) => platformLabel(p)).join(", ")} in Settings before approving.`);
                  return;
                }
                setApprovingTargets(true);
                void approve(approveTargetItem.id, approvePlatforms)
                  .then(() => {
                    setApproveTargetId(null);
                    setEditingId(null);
                    if (approvePlatforms.length > 1) {
                      push(`Content approved for ${approvePlatforms.length} platforms.`);
                    } else {
                      push(`Content approved for ${platformLabel(approvePlatforms[0])}.`);
                    }
                  })
                  .catch((err: unknown) => {
                    push(apiErrorMessage(err));
                  })
                  .finally(() => {
                    setApprovingTargets(false);
                  });
              }}
            >
              {approvingTargets ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {mediaPickerView === "upload" && (
                <div className="space-y-3">
                  <Label className="text-zinc-700 dark:text-zinc-300">Upload from your device</Label>
                  <MediaLocalDropzone
                    busy={uploadingMedia}
                    disabled={uploadingMedia}
                    onFiles={(fl) => {
                      void (async () => {
                        if (fl.length === 0) return;
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
                              applySelectedMedia({ url: lastUrl, type: lastType });
                              push("Media added and selected for this post");
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
              )}
              {mediaPickerView === "library" && (
                <div className="space-y-2">
                  <Label>Choose saved media</Label>
                  {mediaLibrary.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No media in this workspace yet. Use &quot;From computer&quot; to upload.</p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-3">
                      {mediaLibrary.slice(0, 12).map((asset) => {
                        const locked = usedMediaByOtherItems.has(asset.url);
                        return (
                          <div
                            key={`picker-${asset.id}`}
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
                                applySelectedMedia(asset);
                                setMediaPickerOpen(false);
                              }}
                            >
                              <div className="aspect-video w-full">
                                <MediaPreviewBlock
                                  url={asset.url}
                                  mediaType={asset.type}
                                  className="h-full w-full"
                                  videoClassName="h-full w-full rounded-lg object-cover"
                                  imgClassName="h-full w-full rounded-lg object-cover"
                                />
                              </div>
                              <p className="mt-1 truncate text-xs text-zinc-600">{asset.name}</p>
                              {locked && <p className="mt-1 text-[11px] font-medium text-amber-700">Already used in content</p>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

