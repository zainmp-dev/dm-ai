import { type NextRequest } from "next/server";
import { API_PREFIX, proxyToFastapi } from "@/lib/server/backend-proxy";

/**
 * Explicit route for /api/backend/content so POST is never lost to a catch-all or mis-proxy.
 * Proxies to FastAPI POST/GET /content (port 8011 by default).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return proxyToFastapi(request, ["content"], API_PREFIX);
}
export function POST(request: NextRequest) {
  return proxyToFastapi(request, ["content"], API_PREFIX);
}
export function PUT(request: NextRequest) {
  return proxyToFastapi(request, ["content"], API_PREFIX);
}
export function PATCH(request: NextRequest) {
  return proxyToFastapi(request, ["content"], API_PREFIX);
}
export function DELETE(request: NextRequest) {
  return proxyToFastapi(request, ["content"], API_PREFIX);
}
export function HEAD(request: NextRequest) {
  return proxyToFastapi(request, ["content"], API_PREFIX);
}
export function OPTIONS(request: NextRequest) {
  return proxyToFastapi(request, ["content"], API_PREFIX);
}
