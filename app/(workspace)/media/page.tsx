"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiRemoveMediaLibraryItem, apiUploadMediaToCloudinary } from "@/lib/api";
import type { MediaType } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";

const MAX_MEDIA_UPLOAD_BYTES = 8 * 1024 * 1024;

export default function MediaPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const { push } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
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

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter((file) => file.size <= MAX_MEDIA_UPLOAD_BYTES);
    const skipped = Array.from(files).length - accepted.length;
    if (accepted.length === 0) {
      push("All files are too large. Max size is 8MB per file.");
      return;
    }
    setUploading(true);
    try {
      const uploads = await Promise.all(
        accepted.map(async (file) => {
          const dataUrl = await fileToDataUrl(file);
          const mediaType: MediaType = file.type.startsWith("video/") ? "Video" : "Image";
          return apiUploadMediaToCloudinary({ dataUrl, fileName: file.name, mediaType });
        }),
      );
      await refreshWorkspace({ soft: true });
      push(`Uploaded ${uploads.length} media file(s) to Cloudinary${skipped > 0 ? `, skipped ${skipped} oversized file(s)` : ""}`);
    } catch (error) {
      push(error instanceof Error ? error.message : "Cloudinary upload failed");
    } finally {
      setUploading(false);
    }
  };

  const deleteAsset = async (assetId: string) => {
    await apiRemoveMediaLibraryItem(assetId);
    await refreshWorkspace({ soft: true });
    setSelectedIds((prev) => prev.filter((id) => id !== assetId));
    push("Media removed from FlowPilot library");
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    await Promise.all(selectedIds.map((assetId) => apiRemoveMediaLibraryItem(assetId)));
    await refreshWorkspace({ soft: true });
    setSelectedIds([]);
    push(`Removed ${selectedIds.length} selected media item(s)`);
  };

  if (!workspace && loading) {
    return <Skeleton className="h-[560px] w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Media setup</CardTitle>
          <CardDescription>Upload media to Cloudinary and manage your master media library.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="media-upload">Upload images, videos, carousel assets</Label>
          <Input id="media-upload" type="file" accept="image/*,video/*" multiple disabled={uploading} onChange={(e) => void handleUpload(e.target.files)} />
          <p className="text-xs text-zinc-500">
            {uploading ? "Uploading to Cloudinary..." : "Tip: select multiple files to bulk upload media into Cloudinary folder flowpilot."}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Media library</CardTitle>
          <CardDescription>{mediaLibrary.length} saved media item(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-lg"
              onClick={() => setSelectedIds(mediaLibrary.map((asset) => asset.id))}
            >
              Select all
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => setSelectedIds([])}>
              Clear selection
            </Button>
            <Button type="button" size="sm" variant="destructive" className="rounded-lg" onClick={() => void deleteSelected()} disabled={selectedIds.length === 0}>
              Remove selected ({selectedIds.length})
            </Button>
          </div>
          {mediaLibrary.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500">No Cloudinary media yet. Upload files above.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {mediaLibrary.map((asset) => {
                const usage = usageByMedia.get(asset.mediaUrl);
                const isUsed = Boolean(usage?.used);
                const isPublished = Boolean(usage?.published);
                return (
                  <div key={asset.id} className="rounded-xl border border-zinc-200 bg-white p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(asset.id)}
                          onChange={(e) => toggleSelected(asset.id, e.target.checked)}
                        />
                        Select
                      </label>
                      <span className="text-[11px] text-zinc-500">{asset.mediaType}</span>
                    </div>
                    {isVideoAsset(asset.mediaUrl) ? (
                      <video src={asset.mediaUrl} className="aspect-video w-full rounded-lg object-cover" muted playsInline />
                    ) : (
                      <img src={asset.mediaUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
                    )}
                    <Input
                      value={asset.name}
                      readOnly
                      className="mt-2 h-8 rounded-lg text-xs"
                      placeholder="Media name"
                    />
                    <Input
                      value={asset.mediaUrl}
                      readOnly
                      className="mt-2 h-8 rounded-lg text-xs"
                      placeholder="Cloudinary URL"
                    />
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                      <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">{isUsed ? `Used (${usage?.count ?? 0})` : "Available"}</span>
                      {isPublished && <span className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-700">Published</span>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="mt-2 w-full rounded-lg"
                      onClick={() => void deleteAsset(asset.id)}
                    >
                      Remove from library
                    </Button>
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

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function isVideoAsset(src: string) {
  return src.startsWith("data:video/") || src.includes("/video/upload/") || /\.(mp4|mov|webm)(\?|$)/i.test(src);
}
