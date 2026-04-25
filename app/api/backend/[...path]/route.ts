import { type NextRequest } from "next/server";
import { API_PREFIX, proxyToFastapi } from "@/lib/server/backend-proxy";

/**
 * All other /api/backend/* paths (workspace, strategy, …). `/content` is handled by ../content/route.ts.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToFastapi(request, path, API_PREFIX);
}
export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToFastapi(request, path, API_PREFIX);
}
export async function PUT(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToFastapi(request, path, API_PREFIX);
}
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToFastapi(request, path, API_PREFIX);
}
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToFastapi(request, path, API_PREFIX);
}
export async function HEAD(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToFastapi(request, path, API_PREFIX);
}
export async function OPTIONS(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToFastapi(request, path, API_PREFIX);
}
