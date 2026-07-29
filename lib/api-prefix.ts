const DEFAULT_API_PREFIX = "/api/backend";

function normalizePrefix(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Same-origin `/api/backend` proxy in the browser; FastAPI direct URL only when explicitly enabled. */
export function getApiPrefix(): string {
  const configured = normalizePrefix(process.env.NEXT_PUBLIC_API_PREFIX || DEFAULT_API_PREFIX);

  if (typeof window === "undefined") return configured;

  const direct = normalizePrefix((process.env.NEXT_PUBLIC_API_DIRECT_URL || "").trim());
  if (!direct || process.env.NEXT_PUBLIC_API_DIRECT !== "1") {
    return configured;
  }

  const host = window.location.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host);

  return isLocal ? direct : configured;
}
