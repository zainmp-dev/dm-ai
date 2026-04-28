"use client";

import { MediaPreviewBlock } from "@/components/media-preview-block";
import { platformLabel } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type { MediaType, PublishingPlatform } from "@/lib/types";

type Props = {
  platform: PublishingPlatform;
  authorName: string;
  title: string;
  body: string;
  mediaUrl: string;
  mediaType: MediaType;
  /** Tighter layout for grid cards */
  compact?: boolean;
  className?: string;
};

function InitialAvatar({ name, compact }: { name: string; compact?: boolean }) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 ring-1 ring-zinc-200/80",
        compact ? "h-7 w-7" : "h-9 w-9 text-xs",
      )}
    >
      {letter}
    </div>
  );
}

/** Feed-style frame so reviewers see posts roughly as they appear on-network. */
export function SocialPostPreview({
  platform,
  authorName,
  title,
  body,
  mediaUrl,
  mediaType,
  compact,
  className,
}: Props) {
  const handle = (authorName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "brand").slice(0, 28);
  const bodyClamp = compact ? "line-clamp-2" : "";
  const mediaBox = compact ? "h-44 min-h-[11rem]" : "max-h-64";
  const shell = cn(
    "overflow-hidden rounded-lg border border-zinc-200/70 bg-white text-[13px] text-zinc-900",
    compact ? "text-[12px]" : "",
    className,
  );

  if (platform === "instagram") {
    return (
      <div className={shell}>
        <div className={cn("flex items-center gap-2 border-b border-zinc-100/90 bg-zinc-50/40", compact ? "px-2 py-1" : "px-2.5 py-1.5")}>
          <InitialAvatar name={authorName} compact={compact} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold">{handle}</p>
            {title ? <p className="truncate text-[11px] text-zinc-500">{title}</p> : null}
          </div>
        </div>
        <div className={cn("w-full bg-zinc-100", compact ? "aspect-[5/4] max-h-52 sm:aspect-square sm:max-h-56" : "aspect-square")}>
          <MediaPreviewBlock
            url={mediaUrl}
            mediaType={mediaType}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover"
            videoClassName="h-full w-full object-cover"
          />
        </div>
        <div className={cn("px-2.5 py-1.5 leading-snug text-zinc-800", compact ? "px-2 py-1.5" : "", bodyClamp)}>
          <span className="font-semibold text-zinc-900">{handle}</span> <span className="whitespace-pre-wrap">{body}</span>
        </div>
      </div>
    );
  }

  if (platform === "linkedin") {
    return (
      <div className={shell}>
        <div className={cn("flex gap-2", compact ? "px-2 pt-2" : "px-2.5 pt-2.5")}>
          <InitialAvatar name={authorName} compact={compact} />
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{authorName}</p>
            <p className="text-[11px] text-zinc-500">Organization · {platformLabel("linkedin")}</p>
          </div>
        </div>
        {title ? (
          <p className={cn("font-semibold leading-snug text-zinc-900", compact ? "px-2 pt-1.5 text-xs" : "px-2.5 pt-2 text-[13px]")}>{title}</p>
        ) : null}
        <div className={cn("leading-snug text-zinc-800 whitespace-pre-wrap", compact ? "px-2 py-1.5" : "px-2.5 py-2 text-[13px]", bodyClamp)}>{body}</div>
        <div className={cn("border-t border-zinc-100/90", mediaBox, "overflow-hidden bg-zinc-50/30")}>
          <MediaPreviewBlock
            url={mediaUrl}
            mediaType={mediaType}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover"
            videoClassName="h-full w-full object-cover"
          />
        </div>
      </div>
    );
  }

  if (platform === "twitter") {
    return (
      <div className={cn(shell, compact ? "px-2 py-2" : "px-2.5 py-2")}>
        <div className="flex gap-2">
          <InitialAvatar name={authorName} compact={compact} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">{authorName}</p>
            <p className="text-[11px] text-zinc-500">@{handle}</p>
            <div className={cn("mt-1.5 leading-snug whitespace-pre-wrap", bodyClamp)}>{body}</div>
            <div className={cn("mt-2 overflow-hidden rounded-md border border-zinc-100/90 bg-zinc-50/30", mediaBox)}>
              <MediaPreviewBlock
                url={mediaUrl}
                mediaType={mediaType}
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                videoClassName="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* facebook + default */
  return (
    <div className={shell}>
      <div className={cn("flex items-start gap-2", compact ? "px-2 pt-2" : "px-2.5 pt-2.5")}>
        <InitialAvatar name={authorName} compact={compact} />
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{authorName}</p>
          <p className="text-[11px] text-zinc-500">{platformLabel(platform)} · preview</p>
        </div>
      </div>
      <div className={cn("leading-snug whitespace-pre-wrap text-zinc-800", compact ? "px-2 py-1.5" : "px-2.5 py-2", bodyClamp)}>{body}</div>
      <div className={cn(mediaBox, "overflow-hidden bg-zinc-50/30")}>
        <MediaPreviewBlock
          url={mediaUrl}
          mediaType={mediaType}
          className="h-full w-full"
          imgClassName="h-full w-full object-cover"
          videoClassName="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
