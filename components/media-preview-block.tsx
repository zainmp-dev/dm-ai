"use client";

import { startTransition, useEffect, useState } from "react";
import { looksLikeEmbeddedAppPageUrl, shouldUseVideoElement } from "@/lib/media-detect";
import { sanitizeMediaUrl } from "@/lib/api";
import type { MediaType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  url: string;
  mediaType?: MediaType;
  className?: string;
  videoClassName?: string;
  imgClassName?: string;
};

/**
 * Picks <video> vs <img> from URL heuristics + stored mediaType so image/video/carousel previews don't break.
 */
export function MediaPreviewBlock({ url, mediaType = "Image", className, videoClassName, imgClassName }: Props) {
  const safe = sanitizeMediaUrl(url);
  const [broken, setBroken] = useState(false);
  const useVideo = shouldUseVideoElement(safe, mediaType);
  const isCarousel = mediaType === "Carousel";
  /** e.g. AI set Video but URL is still an image placeholder — show still + label */
  const videoPlaceholder = mediaType === "Video" && !useVideo;
  const appPageMisuse = Boolean(safe && looksLikeEmbeddedAppPageUrl(safe));

  useEffect(() => {
    startTransition(() => setBroken(false));
  }, [safe, mediaType]);

  if (!safe || broken || appPageMisuse) {
    return (
      <div
        className={cn(
          "flex min-h-28 w-full items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-center text-xs text-zinc-500",
          appPageMisuse && "border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-50",
          className,
        )}
      >
        {appPageMisuse ? (
          <span>This URL looks like an app link, not image or video. Use Upload or paste a storage link (CDN or media-assets URL).</span>
        ) : broken ? (
          "Preview failed to load. Check the URL or re-upload."
        ) : (
          "No media selected."
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      {isCarousel && (
        <span className="absolute right-2 top-2 z-10 rounded-md bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          Carousel
        </span>
      )}
      {videoPlaceholder && (
        <span className="absolute left-2 top-2 z-10 rounded-md bg-violet-900/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          Video
        </span>
      )}
      {useVideo ? (
        <video
          key={safe}
          src={safe}
          controls
          playsInline
          preload="metadata"
          className={cn("w-full rounded-lg object-cover", videoClassName)}
          onError={() => setBroken(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={safe}
          src={safe}
          alt=""
          className={cn("w-full rounded-lg object-cover", imgClassName)}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}
