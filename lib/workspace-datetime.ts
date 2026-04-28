import { DEFAULT_PRIMARY_REGION, defaultTimeZoneForPrimaryRegion } from "./primary-region";

/** Profile timezone wins; otherwise region default (UAE → Dubai, India / UAE+India → Kolkata). */
export function effectiveContentTimeZone(profileTimezone: string | undefined, primaryRegion: string | undefined): string {
  const t = (profileTimezone || "").trim();
  if (t) return t;
  return defaultTimeZoneForPrimaryRegion(primaryRegion ?? DEFAULT_PRIMARY_REGION);
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `datetime-local` string representing this instant in the given IANA zone. */
export function toDateTimeLocalInZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Interpret `datetime-local` value as wall time in `timeZone` and return UTC ISO string. */
export function zonedLocalToUtcIso(local: string, timeZone: string): string {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return new Date(local).toISOString();
  const target = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const wall = (ms: number) => {
    const parts = fmt.formatToParts(new Date(ms));
    const get = (ty: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === ty)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  };
  for (let i = 0; i < 2000; i++) {
    const w = wall(t);
    if (w === target) return new Date(t).toISOString();
    t += w < target ? 60_000 : -60_000;
  }
  return new Date(t).toISOString();
}

function ymdInZone(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(instant);
  const get = (ty: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === ty)?.value ?? "";
  return { y: +get("year"), m: +get("month"), d: +get("day") };
}

function addGregorianDays(y: number, m: number, d: number, add: number): [number, number, number] {
  const x = new Date(Date.UTC(y, m - 1, d + add));
  return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Presets that use "tomorrow" interpret the calendar day in `timeZone` (India / UAE), not the browser's local zone. */
export function applyTimePresetInZone(preset: string, timeZone: string): string {
  const now = new Date();
  if (preset === "30m") return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  if (preset === "1h") return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  if (preset === "2h") return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  if (preset === "tomorrow-9am" || preset === "tomorrow-6pm") {
    const { y, m, d } = ymdInZone(now, timeZone);
    const [ty, tm, td] = addGregorianDays(y, m, d, 1);
    const hour = preset === "tomorrow-9am" ? "09" : "18";
    return zonedLocalToUtcIso(`${ty}-${pad2(tm)}-${pad2(td)}T${hour}:00`, timeZone);
  }
  return now.toISOString();
}

export function formatInstantInZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(d);
}
