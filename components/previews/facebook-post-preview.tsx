"use client";

import { Globe, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import Image from "next/image";
import { integrationForPlatform } from "@/lib/platform";
import type { ContentItem, WorkspaceSnapshot } from "@/lib/types";

export function FacebookPostPreview({
  item,
  workspace,
}: {
  item: ContentItem;
  workspace: WorkspaceSnapshot;
}) {
  const account = integrationForPlatform(workspace.integrations, "facebook");
  const name = account.accountName ?? "Company Page";

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 p-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          {name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{name}</p>
          <p className="flex items-center gap-1 text-xs text-zinc-500">
            <Globe className="size-3" />
            Public
          </p>
        </div>
      </div>
      <p className="px-3 pb-3 text-sm text-zinc-800">{item.contentText}</p>
      <div className="relative aspect-video w-full bg-zinc-100">
        <Image src={item.mediaPreview} alt="" fill className="object-cover" sizes="512px" unoptimized />
      </div>
      <div className="flex items-center justify-between border-y border-zinc-100 px-3 py-2 text-xs text-zinc-500">
        <span>128 reactions</span>
        <span>14 comments · 3 shares</span>
      </div>
      <div className="grid grid-cols-3 gap-1 p-2">
        <button type="button" className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50">
          <ThumbsUp className="size-5" />
          Like
        </button>
        <button type="button" className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50">
          <MessageCircle className="size-5" />
          Comment
        </button>
        <button type="button" className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50">
          <Share2 className="size-5" />
          Share
        </button>
      </div>
    </div>
  );
}
