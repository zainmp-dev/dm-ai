import axios from "axios";

/** Copy for consistent success toasts (optional — pages can import). */
export const flowSuccessMessages = {
  login: "Welcome back.",
  signup: "Account created successfully.",
  signedOut: "Signed out.",
  saved: "Saved.",
  deleted: "Removed.",
} as const;

/**
 * FastAPI often returns `{ detail: string }` or `{ detail: ValidationErrorItem[] }`.
 * Proxies may wrap payloads; this normalizes to one user-visible line.
 */
export function normalizeFastApiDetail(responseData: unknown): string | null {
  if (!responseData || typeof responseData !== "object") return null;
  const raw = (responseData as Record<string, unknown>).detail;

  if (typeof raw === "string") {
    const t = raw.trim();
    return t || null;
  }

  if (Array.isArray(raw)) {
    const parts: string[] = [];
    for (const item of raw) {
      if (typeof item === "object" && item !== null && "msg" in item) {
        const m = String((item as { msg: unknown }).msg).trim();
        if (m) parts.push(m);
      }
    }
    return parts.length ? parts.join(" ") : null;
  }

  if (raw && typeof raw === "object" && "msg" in (raw as object)) {
    const m = String((raw as { msg: unknown }).msg).trim();
    return m || null;
  }

  return null;
}

/** Next.js / generic JSON error shapes `{ error: string }` (e.g. pipeline route). */
export function normalizeGenericApiError(responseData: unknown): string | null {
  if (!responseData || typeof responseData !== "object") return null;
  const err = (responseData as Record<string, unknown>).error;
  if (typeof err === "string") {
    const t = err.trim();
    return t || null;
  }
  return null;
}

function looksLikeSensitiveLeak(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    /traceback|stack trace|file "|<module>|postgresql\.|syntax error at line|integrityerror|sqlalchemy|exception in thread/i.test(
      lower,
    ) || /\b(sk_live|sk-[a-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{40,})\b/i.test(detail)
  );
}

function statusFallback(status: number): string | null {
  if (status === 401) return "Invalid credentials or session expired.";
  if (status === 403) return "You don’t have permission to do that.";
  if (status === 404) return "That resource was not found.";
  if (status === 408) return "The request took too long. Try again.";
  if (status === 409) return "That action conflicts with the current state.";
  if (status === 422) return "Some fields are invalid. Check your input and try again.";
  if (status === 402) return "AI credits are insufficient. Add credits or choose another model.";
  if (status === 502 || status === 503) return "Service temporarily unavailable. Try again shortly.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return null;
}

/**
 * Single entry point for axios/API failures shown in toasts and inline errors.
 * Prefer server `detail` when it looks safe; otherwise status-based fallbacks.
 */
export function formatApiErrorMessage(error: unknown): string {
  const fallback = "Something went wrong. Please try again.";

  if (!axios.isAxiosError(error)) {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    return fallback;
  }

  const code = error.code;
  if (code === "ECONNABORTED") {
    return "Request timed out. Check your connection or try again.";
  }
  if (code === "ERR_NETWORK" || !error.response) {
    return "Cannot reach the server. Check that the API is running and your network connection.";
  }

  const status = error.response.status;
  const data = error.response.data;

  const fromDetail = normalizeFastApiDetail(data);
  if (fromDetail) {
    const scrubServerErrors = typeof status === "number" && status >= 500;
    if (!scrubServerErrors && !looksLikeSensitiveLeak(fromDetail)) {
      return fromDetail;
    }
  }

  const fromErrorField = normalizeGenericApiError(data);
  if (fromErrorField && typeof status === "number" && status < 500 && !looksLikeSensitiveLeak(fromErrorField)) {
    return fromErrorField;
  }

  const byStatus = statusFallback(status);
  if (byStatus) return byStatus;

  return fallback;
}
