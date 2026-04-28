"use client";

import { Heart, MessageCircle, Repeat2, Send, ThumbsUp } from "lucide-react";
import { MediaPreviewBlock } from "@/components/media-preview-block";
import { integrationForPlatform } from "@/lib/platform";
import type { ContentItem, WorkspaceSnapshot } from "@/lib/types";

export function LinkedInPostPreview({
  item,
  workspace,
}: {
  item: ContentItem;
  workspace: WorkspaceSnapshot;
}) {
  const account = integrationForPlatform(workspace.integrations, "linkedin");
  const name = account.accountName ?? "Marketing Page";
  const handle = account.accountHandle ?? "company";

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex gap-3 border-b border-zinc-100 p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky-700 text-sm font-semibold text-white">
          {name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900">{name}</p>
          <p className="truncate text-xs text-zinc-500">
            @{handle} · Promoted
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{item.contentText}</p>
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-zinc-100">
          <MediaPreviewBlock
            url={item.mediaPreview}
            mediaType={item.mediaType}
            className="absolute inset-0 h-full w-full"
            imgClassName="h-full w-full object-cover"
            videoClassName="h-full w-full object-cover"
          />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-100 px-2 py-2 text-zinc-500">
        <button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition hover:bg-zinc-50">
          <ThumbsUp className="size-4" />
          Like
        </button>
        <button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition hover:bg-zinc-50">
          <MessageCircle className="size-4" />
          Comment
        </button>
        <button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition hover:bg-zinc-50">
          <Repeat2 className="size-4" />
          Repost
        </button>
        <button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition hover:bg-zinc-50">
          <Send className="size-4" />
          Send
        </button>
        <button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition hover:bg-zinc-50">
          <Heart className="size-4" />
        </button>
      </div>
    </div>
  );
}
