/** Stored in backend as `primary_region`; drives AI region context (GCC, India, cross-border). No worldwide/global mode. */
export const DEFAULT_PRIMARY_REGION = "uae-india" as const;

export const PRIMARY_REGION_OPTIONS = [
  { value: "uae-india", label: "UAE + India (recommended)" },
  { value: "india", label: "India" },
  { value: "uae-gcc", label: "UAE & GCC" },
] as const;

export type PrimaryRegionCode = (typeof PRIMARY_REGION_OPTIONS)[number]["value"];

/** Maps legacy `global` and unknown values to the default India/UAE focus. */
export function normalizePrimaryRegionCode(code: string | undefined): PrimaryRegionCode {
  const v = (code || "").trim().toLowerCase();
  if (v === "global") return DEFAULT_PRIMARY_REGION;
  const found = PRIMARY_REGION_OPTIONS.find((o) => o.value === v);
  return found ? found.value : DEFAULT_PRIMARY_REGION;
}

/** Default posting / profile timezone from primary market (matches backend). */
export function defaultTimeZoneForPrimaryRegion(region: string | undefined): string {
  const r = (region || DEFAULT_PRIMARY_REGION).trim().toLowerCase();
  if (r === "uae-gcc") return "Asia/Dubai";
  return "Asia/Kolkata";
}

export function primaryRegionLabel(code: string | undefined): string {
  const found = PRIMARY_REGION_OPTIONS.find((o) => o.value === code);
  return found?.label ?? PRIMARY_REGION_OPTIONS[0].label;
}
