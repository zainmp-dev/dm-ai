"use client";

import { useEffect, useState } from "react";
import { shouldUseVideoElement } from "@/lib/media-detect";
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

  useEffect(() => {
    setBroken(false);
  }, [safe, mediaType]);

  if (!safe || broken) {
    return (
      <div
        className={cn(
          "flex min-h-28 w-full items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-center text-xs text-zinc-500",
          className,
        )}
      >
        {broken ? "Preview failed to load. Check the URL or re-upload." : "No media selected."}
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
