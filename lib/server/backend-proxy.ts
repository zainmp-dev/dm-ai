import { type NextRequest, NextResponse } from "next/server";
import { getAuthApiTimeoutMs } from "@/lib/auth-api-timeout-ms";

export const API_PREFIX = "/api/backend";

const EXPLICIT_UPSTREAM_MS = (() => {
  const raw = process.env.BACKEND_PROXY_UPSTREAM_TIMEOUT_MS?.trim();
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

/** Always at least client auth timeout + buffer so the proxy never aborts before axios. */
const UPSTREAM_FETCH_MS = Math.max(EXPLICIT_UPSTREAM_MS, getAuthApiTimeoutMs() + 30_000);

/** Blog AI generate/optimize can run several minutes on free-tier models. */
const BLOG_AI_PROXY_MS = Math.max(UPSTREAM_FETCH_MS, 600_000);

function upstreamTimeoutMs(pathSegments: string[]): number {
  const joined = pathSegments.join("/").toLowerCase();
  if (joined.includes("blogs/generate") || joined.includes("blogs/optimize")) {
    return BLOG_AI_PROXY_MS;
  }
  return UPSTREAM_FETCH_MS;
}

const SKIP_IN_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function getBackendBase(request: NextRequest): string {
  const explicit = (process.env.BACKEND_PROXY_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const req = request.nextUrl;
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(req.hostname);
  if (isLocalHost) return "http://127.0.0.1:8011";

  const internal = (process.env.BACKEND_INTERNAL_URL || "").trim();
  if (internal) return internal.replace(/\/$/, "");

  // Do not default to `${origin}/api` or `${origin}/api/backend`: OAuth and other routes are
  // implemented on FastAPI at /linkedin/callback, not as public same-origin paths. Hitting the
  // site root + /api causes 404; same-origin + /api/backend would recurse through this proxy.
  return "http://127.0.0.1:8011";
}

/**
 * If BACKEND_PROXY_URL points at this same Next dev server, server-side fetch would call
 * e.g. POST http://localhost:3000/content (a page), which only allows GET → 405 Method Not Allowed.
 * FastAPI must be on a different port (default 8011).
 */
function proxyTargetWouldHitNextItself(request: NextRequest, backendBase: string): boolean {
  let backend: URL;
  try {
    backend = new URL(backendBase);
  } catch {
    return false;
  }
  const req = request.nextUrl;
  if (backend.hostname !== req.hostname) {
    return false;
  }
  const backendPort = backend.port || (backend.protocol === "https:" ? "443" : "80");
  const reqPort = req.port || (req.protocol === "https:" ? "443" : "80");
  if (backendPort !== reqPort) {
    return false;
  }
  const backendPath = backend.pathname.replace(/\/+$/, "");
  // Allow same host/port when a dedicated API base path is configured (e.g. https://domain.tld/api).
  // This is common in AWS reverse-proxy setups and does not imply a loop by itself.
  return backendPath === "" || backendPath === "/";
}

/**
 * Map request URL to FastAPI path segments, e.g. /api/backend/content → ["content"].
 */
export function backendPathFromRequest(request: NextRequest, apiPrefix: string): string[] {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith(apiPrefix)) {
    return [];
  }
  const rest = pathname.slice(apiPrefix.length).replace(/^\/+/, "");
  if (!rest) {
    return [];
  }
  return rest.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

export function buildForwardTarget(backendBase: string, segments: string[], search: string): string {
  const pathPart = segments.map(encodeURIComponent).join("/");
  return `${backendBase}/${pathPart}${search}`;
}

export async function proxyToFastapi(request: NextRequest, pathSegments: string[] | undefined, apiPrefix: string): Promise<NextResponse> {
  const backendBase = getBackendBase(request);

  if (proxyTargetWouldHitNextItself(request, backendBase)) {
    return NextResponse.json(
      {
        detail:
          "BACKEND_PROXY_URL is set to this Next.js server (same host/port as the page). " +
          "Use a different backend origin/port, or include an API base path (for example `https://your-domain.com/api`) " +
          "so requests are routed to FastAPI instead of Next.js pages.",
      },
      { status: 502 },
    );
  }

  const fromUrl = backendPathFromRequest(request, apiPrefix);
  const segments = fromUrl.length ? fromUrl : pathSegments?.length ? pathSegments : [];
  if (!segments.length) {
    return NextResponse.json(
      { detail: "Missing path after /api/backend. Example: POST /api/backend/content" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const target = buildForwardTarget(backendBase, segments, url.search);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (SKIP_IN_HEADERS.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const buf = await request.arrayBuffer();
    if (buf.byteLength) {
      init.body = buf;
    }
  }

  try {
    const res = await fetch(target, {
      ...init,
      signal: AbortSignal.timeout(upstreamTimeoutMs(segments)),
    });
    const outHeaders = new Headers();
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") {
        return;
      }
      outHeaders.set(key, value);
    });
    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream fetch failed";
    const isProdLike =
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL === "1" ||
      Boolean(process.env.FLY_APP_NAME?.trim());
    const detail = isProdLike
      ? "Backend service unavailable."
      : `Cannot reach FastAPI at ${backendBase} (${message}). Start: npm run backend:dev`;
    return NextResponse.json({ detail }, { status: 502 });
  }
}
