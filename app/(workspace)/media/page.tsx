"use client";

import { useMemo, useState } from "react";
import { Check, ImageIcon, Link2, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { MediaLocalDropzone } from "@/components/media-local-dropzone";
import {
  apiAddMediaLibraryByUrl,
  apiErrorMessage,
  apiRemoveMediaLibraryItem,
  apiUploadMediaLocal,
  apiUploadMediaToCloudinary,
} from "@/lib/api";
import type { MediaType } from "@/lib/types";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";

const MAX_MEDIA_UPLOAD_BYTES = 8 * 1024 * 1024;

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function isVideoAsset(src: string) {
  return (
    src.startsWith("data:video/") ||
    src.includes("/video/upload/") ||
    /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src)
  );
}

export default function MediaPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const { push } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  /** When preview fails, remember which asset+URL pair failed so remount clears after URL fix. */
  const [brokenPreview, setBrokenPreview] = useState<Record<string, string>>({});
  const mediaLibrary = workspace?.mediaLibrary ?? [];

  const usageByMedia = useMemo(() => {
    const map = new Map<string, { used: boolean; published: boolean; count: number }>();
    for (const item of workspace?.content ?? []) {
      const key = item.mediaPreview;
      if (!key) continue;
      const current = map.get(key) ?? { used: false, published: false, count: 0 };
      current.used = true;
      current.count += 1;
      if (item.status === "PUBLISHED") {
        current.published = true;
      }
      map.set(key, current);
    }
    return map;
  }, [workspace?.content]);

  const toggleSelected = (assetId: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => (prev.includes(assetId) ? prev : [...prev, assetId]));
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => id !== assetId));
  };

  const handleLocalFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const accepted = files.filter((f) => f.size <= MAX_MEDIA_UPLOAD_BYTES);
    const skipped = files.length - accepted.length;
    if (skipped > 0) {
      push(`${skipped} file(s) skipped (over 8MB per file).`);
    }
    if (accepted.length === 0) return;

    setUploading(true);
    let ok = 0;
    try {
      for (const file of accepted) {
        const dataUrl = await fileToDataUrl(file);
        const mediaType: MediaType = file.type.startsWith("video/") ? "Video" : "Image";
        try {
          if (workspace?.cloudinaryUploadsReady) {
            await apiUploadMediaToCloudinary({ dataUrl, fileName: file.name, mediaType });
          } else {
            await apiUploadMediaLocal({ dataUrl, fileName: file.name, mediaType });
          }
          ok += 1;
          push(`Uploaded · ${file.name}`);
        } catch (err) {
          push(`${file.name}: ${apiErrorMessage(err)}`);
        }
      }
      await refreshWorkspace({ soft: true });
      if (ok > 0) {
        push(
          `Done: ${ok} of ${accepted.length} file(s) added to your library${skipped > 0 ? ` (${skipped} skipped)` : ""}.`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const deleteAsset = async (assetId: string) => {
    await apiRemoveMediaLibraryItem(assetId);
    await refreshWorkspace({ soft: true });
    setSelectedIds((prev) => prev.filter((id) => id !== assetId));
    push("Removed from library");
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const n = selectedIds.length;
    const ids = [...selectedIds];
    await Promise.all(ids.map((assetId) => apiRemoveMediaLibraryItem(assetId)));
    await refreshWorkspace({ soft: true });
    setSelectedIds([]);
    push(`Removed ${n} item(s) from the library`);
  };

  const addLibraryFromUrl = async () => {
    const u = linkUrl.trim();
    if (!u) {
      push("Paste a full Cloudinary URL (https://res.cloudinary.com/…/image/upload/…).");
      return;
    }
    setLinkBusy(true);
    try {
      const r = await apiAddMediaLibraryByUrl({
        mediaUrl: u,
        name: linkName.trim() || undefined,
      });
      await refreshWorkspace({ soft: true });
      push(r.duplicate ? "That URL is already in your library." : "Added to library.");
      if (!r.duplicate) {
        setLinkUrl("");
        setLinkName("");
      }
    } catch (err) {
      push(apiErrorMessage(err));
    } finally {
      setLinkBusy(false);
    }
  };

  if (shellPending) {
    return <Skeleton className="h-[560px] w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <Card className="rounded-2xl border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Media setup</CardTitle>
          <CardDescription>
            {workspace.cloudinaryUploadsReady
              ? "Upload from your computer. Files go to your Cloudinary folder and appear below for use in content."
              : "Upload from your computer. Files are stored on this app&apos;s server and listed below for use in content."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-zinc-700 dark:text-zinc-300">Upload images, videos, or carousel covers</Label>
          <MediaLocalDropzone
            busy={uploading}
            disabled={uploading}
            onFiles={(fl) => void handleLocalFiles(fl)}
          />
          <div className="space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <Label className="text-zinc-700 dark:text-zinc-300">Or link an existing Cloudinary asset</Label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Paste the delivery URL from your Cloudinary Media Library (must include{" "}
              <span className="font-mono">/image/upload/</span>, <span className="font-mono">/video/upload/</span>, or{" "}
              <span className="font-mono">/raw/upload/</span>). Nothing is uploaded again—the app stores the link.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://res.cloudinary.com/…/image/upload/…/your-file.webp"
                  className="rounded-lg font-mono text-xs"
                  disabled={linkBusy || uploading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addLibraryFromUrl();
                  }}
                />
                <Input
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="Optional label (e.g. Social graphic)"
                  className="rounded-lg text-sm"
                  disabled={linkBusy || uploading}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 rounded-lg"
                disabled={linkBusy || uploading}
                onClick={() => void addLibraryFromUrl()}
              >
                {linkBusy ? "Adding…" : "Add URL to library"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Media library</CardTitle>
            <CardDescription>
              {mediaLibrary.length} item{mediaLibrary.length === 1 ? "" : "s"} · used in content when you pick a URL
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-lg"
              onClick={() => setSelectedIds(mediaLibrary.map((a) => a.id))}
            >
              Select all
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => setSelectedIds([])}>
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="rounded-lg"
              onClick={() => void deleteSelected()}
              disabled={selectedIds.length === 0}
            >
              Remove selected ({selectedIds.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mediaLibrary.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
              <div className="mb-2 rounded-full bg-zinc-200/80 p-3 dark:bg-zinc-800">
                <ImageIcon className="size-7 text-zinc-500" />
              </div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No media yet</p>
              <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">Upload files above. They are saved on the server and appear here for reuse in posts.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mediaLibrary.map((asset) => {
                const usage = usageByMedia.get(asset.mediaUrl);
                const isUsed = Boolean(usage?.used);
                const isPublished = Boolean(usage?.published);
                const previewBroken = Boolean(asset.mediaUrl) && brokenPreview[asset.id] === asset.mediaUrl;
                return (
                  <div
                    key={asset.id}
                    className={cn(
                      "group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80",
                      selectedIds.includes(asset.id) && "ring-2 ring-blue-500 dark:ring-blue-400",
                    )}
                  >
                    <div className="relative aspect-video w-full bg-zinc-100 dark:bg-zinc-800">
                      {previewBroken ? (
                        <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
                          <ImageIcon className="size-8 text-zinc-400" />
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Preview failed — check the URL opens in a new tab, or remove and re-upload.
                          </p>
                        </div>
                      ) : isVideoAsset(asset.mediaUrl) ? (
                        <video
                          key={asset.mediaUrl}
                          src={asset.mediaUrl}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          onError={() => setBrokenPreview((p) => ({ ...p, [asset.id]: asset.mediaUrl }))}
                        />
                      ) : (
                        <img
                          key={asset.mediaUrl}
                          src={asset.mediaUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={() => setBrokenPreview((p) => ({ ...p, [asset.id]: asset.mediaUrl }))}
                        />
                      )}
                      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-0.5 text-[10px] font-medium text-zinc-800 shadow dark:bg-zinc-900/90 dark:text-zinc-100">
                        {isVideoAsset(asset.mediaUrl) ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
                        {asset.mediaType}
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                          <input
                            type="checkbox"
                            className="rounded border-zinc-300 dark:border-zinc-600"
                            checked={selectedIds.includes(asset.id)}
                            onChange={(e) => toggleSelected(asset.id, e.target.checked)}
                          />
                          Select
                        </label>
                        <div className="flex flex-wrap justify-end gap-1">
                          {isUsed && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                              <Check className="size-2.5" />
                              {usage?.count ?? 0} in use
                            </span>
                          )}
                          {isPublished && (
                            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">Published</span>
                          )}
                        </div>
                      </div>
                      <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100" title={asset.name}>
                        {asset.name}
                      </p>
                      <div className="flex items-center gap-1">
                        <Input
                          value={asset.mediaUrl}
                          readOnly
                          title={asset.mediaUrl}
                          className="h-8 min-w-0 flex-1 rounded-lg font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-950/50"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 rounded-lg px-2"
                          title="Copy URL"
                          onClick={() => {
                            void navigator.clipboard.writeText(asset.mediaUrl).then(() => push("URL copied"));
                          }}
                        >
                          <Link2 className="size-3.5" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="w-full gap-1.5 rounded-lg"
                        onClick={() => void deleteAsset(asset.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Remove from library
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
