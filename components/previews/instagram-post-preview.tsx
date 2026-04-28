"use client";

import { Bookmark, Heart, MessageCircle, Send } from "lucide-react";
import { MediaPreviewBlock } from "@/components/media-preview-block";
import { integrationForPlatform } from "@/lib/platform";
import type { ContentItem, WorkspaceSnapshot } from "@/lib/types";

export function InstagramPostPreview({
  item,
  workspace,
}: {
  item: ContentItem;
  workspace: WorkspaceSnapshot;
}) {
  const account = integrationForPlatform(workspace.integrations, "instagram");
  const handle = account.accountHandle ?? "yourbrand";

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5">
        <div className="flex size-9 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-800">
          {handle.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900">@{handle}</p>
        </div>
      </div>
      <div className="relative aspect-square w-full bg-zinc-100">
        <MediaPreviewBlock
          url={item.mediaPreview}
          mediaType={item.mediaType}
          className="absolute inset-0 h-full w-full"
          imgClassName="h-full w-full object-cover"
          videoClassName="h-full w-full object-cover"
        />
      </div>
      <div className="space-y-2 px-3 py-3">
        <div className="flex items-center justify-between text-zinc-800">
          <div className="flex gap-4">
            <Heart className="size-6" />
            <MessageCircle className="size-6" />
            <Send className="size-6" />
          </div>
          <Bookmark className="size-6" />
        </div>
        <p className="text-sm font-semibold text-zinc-900">@{handle}</p>
        <p className="text-sm leading-relaxed text-zinc-800">{item.contentText}</p>
      </div>
    </div>
  );
}
