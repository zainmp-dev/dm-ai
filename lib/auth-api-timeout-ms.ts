/**
 * Single source of truth for login/signup/OAuth client timeouts (browser).
 * Server proxy should wait longer than this — see `lib/server/backend-proxy.ts`.
 */
const DEFAULT_MS = 120_000;
const FLOOR_MS = 60_000;

export function getAuthApiTimeoutMs(): number {
  const raw = process.env.NEXT_PUBLIC_AUTH_REQUEST_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_MS;
  const n = Number.parseInt(raw, 10);
  const v = Number.isFinite(n) && n > 0 ? n : DEFAULT_MS;
  return Math.max(FLOOR_MS, v);
}
