import type { MediaType } from "@/lib/types";

/**
 * Heuristic: likely an image we should render in <img>, not <video>.
 * Cloudinary "image" resources and common static hosts.
 */
export function isImageLikeUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  const l = u.toLowerCase();
  if (l.startsWith("data:image/")) return true;
  if (l.includes("res.cloudinary.com") && l.includes("/image/upload/")) return true;
  if (l.includes("picsum.photos") || l.includes("unsplash.com") || l.includes("placeholder")) return true;
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp|ico)(\?|#|$)/i.test(l)) return true;
  return false;
}

/**
 * Heuristic: should use <video> (files, data URLs, Cloudinary video, common CDNs).
 */
export function isVideoSourceUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  const l = u.toLowerCase();
  if (l.startsWith("data:video/")) return true;
  if (l.includes("res.cloudinary.com") && l.includes("/video/upload/")) return true;
  if (l.includes("storage.googleapis.com") && l.includes("gtv-videos-bucket")) return true;
  if (/\.(mp4|webm|mov|m4v|m3u8|ogv)(\?|#|$)/i.test(l)) return true;
  return false;
}

/**
 * When to render <video> vs <img> given type + URL. Avoid putting image URLs in <video> (broken UI).
 */
export function shouldUseVideoElement(url: string, mediaType: MediaType | undefined): boolean {
  const l = url.trim().toLowerCase();
  if (l.includes("youtube.com") || l.includes("youtu.be") || l.includes("vimeo.com")) return false;
  if (isImageLikeUrl(url)) return false;
  if (isVideoSourceUrl(url)) return true;
  if (mediaType === "Video") return true;
  return false;
}

export function normalizeApiMediaType(raw: string | undefined, fallback: MediaType = "Image"): MediaType {
  const s = (raw || "").trim();
  if (s === "Video" || s === "Image" || s === "Carousel" || s === "Media") {
    if (s === "Media") return "Image";
    return s;
  }
  return fallback;
}
