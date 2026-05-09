import { type NextRequest } from "next/server";
import { API_PREFIX, proxyToFastapi } from "@/lib/server/backend-proxy";

/**
 * Serves user-uploaded files via Next → FastAPI GET /media-assets/{workspace_id}/{file_name}.
 * Request pathname is used to build the upstream path; optional catch-all matches depth.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

function proxy(request: NextRequest) {
  return proxyToFastapi(request, undefined, API_PREFIX);
}

export async function GET(request: NextRequest) {
  return proxy(request);
}
export async function HEAD(request: NextRequest) {
  return proxy(request);
}
export async function OPTIONS(request: NextRequest) {
  return proxy(request);
}
