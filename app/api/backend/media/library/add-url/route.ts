import { type NextRequest } from "next/server";
import { API_PREFIX, proxyToFastapi } from "@/lib/server/backend-proxy";

/** POST /api/backend/media/library/add-url → FastAPI (link Cloudinary URL into library). */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const SEG = ["media", "library", "add-url"] as const;

export function POST(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
export function OPTIONS(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
