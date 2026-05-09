const REDACT_PATTERNS = [/token/gi, /authorization/gi, /password/gi, /secret/gi, /cookie/gi];

function safeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (REDACT_PATTERNS.some((rx) => rx.test(key))) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > 220) {
      out[key] = `${value.slice(0, 220)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function appLog(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  const payload = safeMeta(meta);
  if (level === "error") {
    console.error(message, payload);
    return;
  }
  if (level === "warn") {
    console.warn(message, payload);
    return;
  }
  console.info(message, payload);
}
