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

  if (raw && typeof raw === "object" && "message" in (raw as object)) {
    return formatProviderFailureDetail(raw as Record<string, unknown>);
  }

  return null;
}

function formatProviderFailureDetail(raw: Record<string, unknown>): string | null {
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  const providers = Array.isArray(raw.providers) ? raw.providers : [];
  if (!message && providers.length === 0) return null;

  const lines = [message || "AI generation is temporarily unavailable."];
  if (providers.length > 0) {
    lines.push("", "Provider status:");
    for (const item of providers) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const status = typeof row.status === "string" ? row.status.trim() : "";
      if (!name && !status) continue;
      if (name) lines.push(name);
      if (status) lines.push(status);
      lines.push("");
    }
    if (lines[lines.length - 1] === "") lines.pop();
  }
  if (action) {
    lines.push("", action);
  }
  return lines.join("\n");
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
  if (code === "ERR_CANCELED") {
    return "Request was cancelled (e.g. page changed or duplicate submit). Try again.";
  }
  if (code === "ECONNABORTED") {
    return "Request timed out—the API or database took too long, or the server is still starting. Wait a moment and try again.";
  }
  if (code === "ERR_NETWORK" || !error.response) {
    if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      return "Cannot reach the API. Ensure npm run dev:all is running (FastAPI on 8011), then hard-refresh (Cmd+Shift+R). If the page looks broken, stop the server, run rm -rf .next, and start dev:all again.";
    }
    return "Cannot reach the server. Check that the API is running and your network connection.";
  }

  const status = error.response.status;
  const data = error.response.data;

  const fromDetail = normalizeFastApiDetail(data);
  if (fromDetail) {
    const scrubServerErrors = typeof status === "number" && status >= 500;
    // Dev proxy 502s include actionable "Cannot reach FastAPI… Start: npm run backend:dev".
    const isActionableBackendDown =
      typeof status === "number" &&
      (status === 502 || status === 503) &&
      /cannot reach fastapi|start:\s*npm run backend|ai generation is temporarily unavailable/i.test(fromDetail);
    if ((!scrubServerErrors || isActionableBackendDown) && !looksLikeSensitiveLeak(fromDetail)) {
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

/** True when trying another AI model slug may recover (budget, rate limits, transient gateway/network). */
export function isAiProviderRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 402 || status === 429 || status === 408 || status === 502 || status === 503) {
      return true;
    }
    if (!error.response || error.code === "ERR_NETWORK") {
      return true;
    }
    if ((status === undefined || status >= 500) && error.code === "ECONNABORTED") {
      return true;
    }
    return false;
  }
  const msg = formatApiErrorMessage(error).toLowerCase();
  return /rate\s*limit|too many requests|credit|quota|payment required|timed out|temporarily unavailable|502|503|429|ECONNRESET|ECONNREFUSED/i.test(msg);
}
