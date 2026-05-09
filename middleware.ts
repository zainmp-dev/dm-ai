import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/auth/callback", "/linkedin/callback", "/auth/meta/callback"]);

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/") return false;
  if (PUBLIC_PATHS.has(pathname)) return false;
  if (pathname.startsWith("/api")) return false;
  return true;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("flowpilot_token")?.value;
  if (!token && isProtectedPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

// Include "/" explicitly — a common regex-only matcher can skip the bare root, so
// / never ran auth and app/page.tsx could still render (e.g. redirect edge cases in dev).
export const config = {
  matcher: ["/", "/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
