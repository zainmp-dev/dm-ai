"use client";

import { BarChart2, Heart, MessageCircle, Repeat2, Share } from "lucide-react";
import Image from "next/image";
import { integrationForPlatform } from "@/lib/platform";
import type { ContentItem, WorkspaceSnapshot } from "@/lib/types";

export function TwitterPostPreview({
  item,
  workspace,
}: {
  item: ContentItem;
  workspace: WorkspaceSnapshot;
}) {
  const account = integrationForPlatform(workspace.integrations, "twitter");
  const name = account.accountName ?? workspace.companyName ?? "FlowPilot Workspace";
  const handle = account.accountHandle ?? "flowpilot";

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-900">{name}</p>
          <p className="truncate text-xs text-zinc-500">@{handle}</p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{item.contentText}</p>
      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl bg-zinc-100">
        <Image src={item.mediaPreview} alt="" fill className="object-cover" sizes="560px" unoptimized />
      </div>
      <div className="mt-3 flex items-center justify-between text-zinc-500">
        <MessageCircle className="size-4" />
        <Repeat2 className="size-4" />
        <Heart className="size-4" />
        <BarChart2 className="size-4" />
        <Share className="size-4" />
      </div>
    </div>
  );
}
