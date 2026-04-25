"use client";

import { useMemo, useState } from "react";
import { ContentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUploadMediaToCloudinary } from "@/lib/api";
import { platformLabel } from "@/lib/platform";
import type { MediaType, PublishingPlatform } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";

const APPROVAL_PLATFORM_OPTIONS = [
  { id: "linkedin", disabled: false },
  { id: "instagram", disabled: false },
  { id: "facebook", disabled: false },
  { id: "twitter", disabled: true },
] as const;
const ACTIVE_APPROVAL_PLATFORMS = APPROVAL_PLATFORM_OPTIONS.filter((platform) => !platform.disabled).map((platform) => platform.id);

interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  createdAt: string;
}

const TIME_OPTIONS = [
  { label: "Now + 30 min", value: "30m" },
  { label: "Now + 1 hour", value: "1h" },
  { label: "Now + 2 hours", value: "2h" },
  { label: "Tomorrow 09:00", value: "tomorrow-9am" },
  { label: "Tomorrow 18:00", value: "tomorrow-6pm" },
] as const;

export default function ContentPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const generateContent = useWorkspaceStore((s) => s.generateContent);
  const createContentItem = useWorkspaceStore((s) => s.createContentItem);
  const approve = useWorkspaceStore((s) => s.approve);
  const reject = useWorkspaceStore((s) => s.reject);
  const updateContentItem = useWorkspaceStore((s) => s.updateContentItem);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const { push } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approveTargetId, setApproveTargetId] = useState<string | null>(null);
  const [calendarDays, setCalendarDays] = useState(14);
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
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<"create" | "edit">("create");
  const [mediaPickerView, setMediaPickerView] = useState<"upload" | "library">("upload");

  const content = useMemo(() => workspace?.content ?? [], [workspace]);
  const uniqueMedia = new Set(content.map((item) => item.mediaPreview));
  const activeItem = useMemo(() => content.find((item) => item.id === editingId) ?? null, [content, editingId]);
  const approveTargetItem = useMemo(() => content.find((item) => item.id === approveTargetId) ?? null, [content, approveTargetId]);
  const approveAllChecked = approvePlatforms.length === ACTIVE_APPROVAL_PLATFORMS.length;
  const mediaLibrary = useMemo(() => {
    const seen = new Set<string>();
    return (workspace?.mediaLibrary ?? [])
      .filter((asset) => asset.mediaUrl && asset.mediaUrl.startsWith("https://res.cloudinary.com/"))
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

  const applySelectedMedia = (asset: { url: string }) => {
    if (mediaPickerTarget === "create") {
      setNewMediaPreview(asset.url);
      return;
    }
    setDraftMediaPreview(asset.url);
  };

  const openMediaPicker = (target: "create" | "edit") => {
    setMediaPickerTarget(target);
    setMediaPickerView("upload");
    setMediaPickerOpen(true);
  };

  if (!workspace && loading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Master content data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-title">Title</Label>
              <Input id="new-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Launch campaign insight post" />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-time">Publish time (optional)</Label>
                <Input id="new-time" type="datetime-local" value={newScheduledAt} onChange={(e) => setNewScheduledAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-time-option">Time option</Label>
                <select
                  id="new-time-option"
                  value={newTimePreset}
                  onChange={(e) => {
                    const selected = e.target.value;
                    setNewTimePreset(selected);
                    if (!selected) return;
                    setNewScheduledAt(toDateTimeLocalValue(applyTimePreset(selected)));
                  }}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                >
                  <option value="">Select time option</option>
                  {TIME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-500">You can set exact time manually or choose a quick option.</p>
          <div className="space-y-2">
            <Label htmlFor="new-text">Content</Label>
            <Textarea id="new-text" value={newText} onChange={(e) => setNewText(e.target.value)} className="min-h-24" placeholder="Write post content..." />
          </div>
          <div className="space-y-2">
            <Label>Media</Label>
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => openMediaPicker("create")}>
              Upload or choose media
            </Button>
            <p className="text-xs text-zinc-500">Uploads are stored in Cloudinary and reused from your workspace media library.</p>
          </div>
          {newMediaPreview && (
            <div className="rounded-xl border border-zinc-200 p-2">
              {isVideoAsset(newMediaPreview) ? (
                <video src={newMediaPreview} controls className="h-40 w-full rounded-lg object-cover" />
              ) : (
                <img src={newMediaPreview} alt="" className="h-40 w-full rounded-lg object-cover" />
              )}
              <Button type="button" size="sm" variant="outline" className="mt-2 rounded-lg" onClick={() => setNewMediaPreview("")}>
                Remove selected media
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={newAutoActivate} onChange={(e) => setNewAutoActivate(e.target.checked)} />
              Auto approve + schedule using default platform
            </label>
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl"
              onClick={() => {
                setNewTimePreset("1h");
                setNewScheduledAt(toDateTimeLocalValue(applyTimePreset("1h")));
              }}
            >
              Auto time (+1h)
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={creating || !newTitle.trim() || !newText.trim()}
              onClick={() => {
                if (!newMediaPreview) {
                  push("Please include at least one media file.");
                  return;
                }
                if (newAutoActivate && !newScheduledAt) {
                  push("Please select publish time before auto activate.");
                  return;
                }
                setCreating(true);
                void createContentItem({
                  title: newTitle.trim(),
                  contentText: newText.trim(),
                  mediaType: inferMediaType(newMediaPreview),
                  mediaPreview: newMediaPreview,
                  scheduledAt: newScheduledAt ? new Date(newScheduledAt).toISOString() : undefined,
                  autoActivate: newAutoActivate,
                })
                  .then(() => {
                    push("Content created");
                    setNewTitle("");
                    setNewText("");
                    setNewMediaPreview("");
                    setNewScheduledAt("");
                    setNewTimePreset("");
                  })
                  .finally(() => setCreating(false));
              }}
            >
              {creating ? "Creating..." : "Create content"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Content engine controls</CardTitle>
          <p className="text-xs text-zinc-500">Generate a 7-30 day calendar with unique media assets.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {[7, 14, 21, 30].map((days) => (
            <Button key={days} type="button" size="sm" variant={calendarDays === days ? "default" : "secondary"} className="rounded-xl" onClick={() => setCalendarDays(days)}>
              {days} days
            </Button>
          ))}
          <Button
            type="button"
            className="rounded-xl"
            onClick={() =>
              void generateContent(calendarDays).then(() => {
                push(`Generated ${calendarDays}-day content calendar`);
              })
            }
          >
            Regenerate calendar
          </Button>
          <p className="text-xs text-zinc-500">
            Media uniqueness: {uniqueMedia.size}/{content.length} unique
          </p>
        </CardContent>
      </Card>
      {content.length === 0 && (
        <Card className="rounded-2xl border-dashed border-zinc-200">
          <CardContent className="py-12 text-center text-sm text-zinc-500">No content in library.</CardContent>
        </Card>
      )}
      {content.map((item) => (
        <Card key={item.id} className="rounded-2xl border-zinc-200 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{item.title}</CardTitle>
              <p className="mt-1 text-sm text-zinc-500">
                {item.mediaType}
                {item.selectedPlatform ? (
                  <>
                    {" "}
                    · <span className="text-zinc-700">{platformLabel(item.selectedPlatform)}</span>
                  </>
                ) : null}
                {item.scheduledAt ? (
                  <>
                    {" "}
                    · <span className="text-zinc-600">Time: {toDateTimeLocalValue(item.scheduledAt)}</span>
                  </>
                ) : null}
              </p>
            </div>
            <ContentStatusBadge status={item.status} />
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-center">
            {isVideoAsset(item.mediaPreview) ? (
              <video src={item.mediaPreview} controls className="h-28 w-full rounded-2xl object-cover shadow-sm" />
            ) : (
              <img src={item.mediaPreview} alt="" className="h-28 w-full rounded-2xl object-cover shadow-sm" />
            )}
            <p className="text-sm leading-relaxed text-zinc-700">{item.contentText}</p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="rounded-xl"
                onClick={() => {
                  setEditingId(item.id);
                  setDraftTitle(item.title);
                  setDraftText(item.contentText);
                  setDraftMediaPreview(item.mediaPreview);
                  setDraftScheduledAt(toDateTimeLocalValue(item.scheduledAt));
                  setDraftTimePreset("");
                  setDraftAutoActivate(item.status === "APPROVED" || item.status === "SCHEDULED");
                }}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="rounded-xl"
                disabled={item.status === "PUBLISHED"}
                onClick={() => void reject(item.id).then(() => push("Content rejected"))}
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {activeItem && (
        <Dialog open={Boolean(activeItem)} onOpenChange={(o) => !o && setEditingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit content</DialogTitle>
            </DialogHeader>
            <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className="rounded-xl" />
            <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} className="min-h-28 rounded-xl" />
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => openMediaPicker("edit")}>
              Upload or choose media
            </Button>
            {draftMediaPreview && (
              <div className="rounded-xl border border-zinc-200 p-2">
                {isVideoAsset(draftMediaPreview) ? (
                  <video src={draftMediaPreview} controls className="h-40 w-full rounded-lg object-cover" />
                ) : (
                  <img src={draftMediaPreview} alt="" className="h-40 w-full rounded-lg object-cover" />
                )}
                <Button type="button" size="sm" variant="outline" className="mt-2 rounded-lg" onClick={() => setDraftMediaPreview("")}>
                  Remove selected media
                </Button>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <Input type="datetime-local" value={draftScheduledAt} onChange={(e) => setDraftScheduledAt(e.target.value)} className="rounded-xl" />
              <select
                value={draftTimePreset}
                onChange={(e) => {
                  const selected = e.target.value;
                  setDraftTimePreset(selected);
                  if (!selected) return;
                  setDraftScheduledAt(toDateTimeLocalValue(applyTimePreset(selected)));
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
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={draftAutoActivate} onChange={(e) => setDraftAutoActivate(e.target.checked)} />
              Auto activate scheduling
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraftTimePreset("1h");
                  setDraftScheduledAt(toDateTimeLocalValue(applyTimePreset("1h")));
                }}
              >
                Auto time (+1h)
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                onClick={() =>
                  (() => {
                    if (!draftMediaPreview) {
                      push("Please include at least one media file.");
                      return;
                    }
                    if (draftAutoActivate && !draftScheduledAt) {
                      push("Please select publish time before auto activate.");
                      return;
                    }
                    void updateContentItem({
                      contentId: activeItem.id,
                      title: draftTitle,
                      contentText: draftText,
                      mediaType: inferMediaType(draftMediaPreview),
                      mediaPreview: draftMediaPreview,
                      scheduledAt: draftScheduledAt ? new Date(draftScheduledAt).toISOString() : undefined,
                      autoActivate: draftAutoActivate,
                    }).then(() => {
                      setEditingId(null);
                      push("Content updated");
                    });
                  })()
                }
              >
                Save changes
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                onClick={() => {
                  setApproveTargetId(activeItem.id);
                  setApprovePlatforms(activeItem.selectedPlatform ? [activeItem.selectedPlatform] : []);
                }}
              >
                Approve setup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={Boolean(approveTargetItem)} onOpenChange={(o) => !o && setApproveTargetId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Publishing Platform</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={approveAllChecked}
                onChange={(e) => setApprovePlatforms(e.target.checked ? [...ACTIVE_APPROVAL_PLATFORMS] : [])}
              />
              All
            </label>
            {APPROVAL_PLATFORM_OPTIONS.map((option) => (
              <label
                key={option.id}
                title={option.disabled ? "Coming soon" : undefined}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  option.disabled ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500" : "border-zinc-200 text-zinc-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={approvePlatforms.includes(option.id)}
                  disabled={option.disabled}
                  onChange={() =>
                    setApprovePlatforms((current) =>
                      current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id],
                    )
                  }
                />
                {platformLabel(option.id)}
                {option.disabled ? " (Coming soon)" : ""}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setApproveTargetId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!approveTargetItem || approvePlatforms.length === 0) {
                  push("Please select at least one platform.");
                  return;
                }
                void approve(approveTargetItem.id, approvePlatforms).then(() => {
                  if (approvePlatforms.length > 1) {
                    push(`Content approved for ${approvePlatforms.length} platforms.`);
                  } else {
                    push(`Content approved for ${platformLabel(approvePlatforms[0])}.`);
                  }
                  setApproveTargetId(null);
                  setEditingId(null);
                });
              }}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mediaPickerOpen} onOpenChange={setMediaPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Media picker</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Button type="button" variant={mediaPickerView === "upload" ? "default" : "secondary"} className="w-full rounded-xl" onClick={() => setMediaPickerView("upload")}>
                Upload to Cloudinary
              </Button>
              <Button type="button" variant={mediaPickerView === "library" ? "default" : "secondary"} className="w-full rounded-xl" onClick={() => setMediaPickerView("library")}>
                Media library
              </Button>
            </div>
            <div className="space-y-3">
              {mediaPickerView === "upload" && (
                <div className="space-y-2">
                  <Label htmlFor="modal-media-upload">Upload image or video to Cloudinary</Label>
                  <Input
                    id="modal-media-upload"
                    type="file"
                    accept="image/*,video/*"
                    disabled={uploadingMedia}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const mediaType: MediaType = file.type.startsWith("video/") ? "Video" : "Image";
                      setUploadingMedia(true);
                      void fileToDataUrl(file)
                        .then((dataUrl) => apiUploadMediaToCloudinary({ dataUrl, fileName: file.name, mediaType }))
                        .then(({ mediaUrl, mediaType: uploadedMediaType }) => {
                          if (usedMediaByOtherItems.has(mediaUrl)) {
                            push("This media is already mapped in content and cannot be reused.");
                            return;
                          }
                          const asset: MediaAsset = {
                            id: mediaUrl,
                            name: file.name,
                            type: uploadedMediaType,
                            url: mediaUrl,
                            createdAt: new Date().toISOString(),
                          };
                          applySelectedMedia(asset);
                          void refreshWorkspace({ soft: true });
                          push("Media uploaded to Cloudinary");
                          setMediaPickerOpen(false);
                        })
                        .catch((error) => {
                          push(error instanceof Error ? error.message : "Cloudinary upload failed");
                        })
                        .finally(() => {
                          setUploadingMedia(false);
                          e.currentTarget.value = "";
                        });
                    }}
                  />
                  {uploadingMedia && <p className="text-xs text-zinc-500">Uploading to Cloudinary...</p>}
                </div>
              )}
              {mediaPickerView === "library" && (
                <div className="space-y-2">
                  <Label>Choose saved media</Label>
                  {mediaLibrary.length === 0 ? (
                    <p className="text-sm text-zinc-500">No Cloudinary media in this workspace yet. Upload from computer first.</p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-3">
                      {mediaLibrary.slice(0, 12).map((asset) => {
                        const locked = usedMediaByOtherItems.has(asset.url);
                        return (
                          <div key={`picker-${asset.id}`} className="rounded-xl border border-zinc-200 bg-white p-2">
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
                              {isVideoAsset(asset.url) ? (
                                <video src={asset.url} className="aspect-video w-full rounded-lg object-cover" muted playsInline />
                              ) : (
                                <img src={asset.url} alt="" className="aspect-video w-full rounded-lg object-cover" />
                              )}
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

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function applyTimePreset(preset: string) {
  const now = new Date();
  if (preset === "30m") return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  if (preset === "1h") return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  if (preset === "2h") return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  if (preset === "tomorrow-9am") {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next.toISOString();
  }
  if (preset === "tomorrow-6pm") {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(18, 0, 0, 0);
    return next.toISOString();
  }
  return now.toISOString();
}

function isVideoAsset(src: string) {
  return src.startsWith("data:video/") || src.includes("/video/upload/") || /\.(mp4|mov|webm)(\?|$)/i.test(src);
}

function inferMediaType(src: string): MediaType {
  if (!src) return "Image";
  if (isVideoAsset(src)) return "Video";
  if (src.startsWith("data:image/")) return "Image";
  return "Image";
}
