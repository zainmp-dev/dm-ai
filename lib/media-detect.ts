import type { MediaType } from "@/lib/types";

/**
 * Heuristic: likely an image we should render in <img>, not <video>.
 * Cloudinary "image" resources and common static hosts.
 */
export function isImageLikeUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  const l = u.toLowerCase();
  // Prefer file extension over hostnames (e.g. videos.pexels.com/…/clip.mp4)
  if (/\.(mp4|webm|mov|m4v|m3u8|ogv)(\?|#|$)/i.test(l)) return false;
  if (l.startsWith("data:image/")) return true;
  if (l.includes("/api/media-assets/") || l.includes("/api/backend/media-assets/")) {
    if (!/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(l)) return true;
  }
  if (l.includes("res.cloudinary.com") && l.includes("/image/upload/")) return true;
  if (
    l.includes("picsum.photos") ||
    l.includes("unsplash.com") ||
    l.includes("pexels.com") ||
    l.includes("pixabay.com") ||
    l.includes("placeholder")
  )
    return true;
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
  if (l.includes("/api/media-assets/") || l.includes("/api/backend/media-assets/")) {
    if (/\.(mp4|webm|mov|m4v|avi)(\?|#|$)/i.test(l)) return true;
  }
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

/** Workspace library URL: Cloudinary (legacy) or this app's local /api(/backend)/media-assets/... */
export function isWorkspaceLibraryMediaUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  const l = u.toLowerCase();
  if (l.startsWith("https://res.cloudinary.com/") || l.startsWith("http://res.cloudinary.com/")) return true;
  if (u.includes("/api/media-assets/") || u.startsWith("/api/media-assets/")) return true;
  if (u.includes("/api/backend/media-assets/") || u.startsWith("/api/backend/media-assets/")) return true;
  return false;
}

/**
 * SPA / dashboard URLs pasted as media often resolve to HTML pages (looks like a broken screenshot in <img>).
 * Prefer direct CDN or `/api/(backend/)media-assets/` links with a proper file suffix.
 */
export function looksLikeEmbeddedAppPageUrl(url: string): boolean {
  const s = url.trim();
  if (!s || s.startsWith("data:")) return false;
  if (!/^https?:\/\//i.test(s) && !/^\/\//i.test(s)) return false;
  try {
    const normalized = /^\/\//i.test(s) ? `https:${s}` : s;
    const parsed = new URL(normalized);
    const path = parsed.pathname.toLowerCase();
    if (/\.(jpe?g|png|gif|webp|avif|svg|bmp|ico|mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(path)) return false;
    if (/\/api\/(?:backend\/)?media-assets\//i.test(path)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host.includes("cloudinary.com")) return false;
    if (host.endsWith(".googleapis.com")) return false;
    if (/^\/(?:pipeline|login|campaigns|settings|analytics|dashboard|notifications|workflow)(\/|$|\?)/i.test(path)) return true;
  } catch {
    /* malformed URL */
  }
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
