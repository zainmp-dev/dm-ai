import { type NextRequest } from "next/server";
import { API_PREFIX, proxyToFastapi } from "@/lib/server/backend-proxy";

/**
 * Explicit route for /api/backend/media/upload/cloudinary (POST from Media setup when using Cloudinary).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const SEG = ["media", "upload", "cloudinary"] as const;

export function GET(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
export function POST(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
export function PUT(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
export function PATCH(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
export function DELETE(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
export function HEAD(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
export function OPTIONS(request: NextRequest) {
  return proxyToFastapi(request, [...SEG], API_PREFIX);
}
