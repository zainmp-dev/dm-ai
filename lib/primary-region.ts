/** Stored in backend as `primary_region`; drives AI region context (GCC, India, cross-border). No worldwide/global mode. */
export const DEFAULT_PRIMARY_REGION = "uae-india" as const;

export const PRIMARY_REGION_OPTIONS = [
  { value: "uae-india", label: "UAE + India (recommended)" },
  { value: "india", label: "India" },
  { value: "uae-gcc", label: "UAE & GCC" },
  { value: "saudi-arabia", label: "Saudi Arabia" },
  { value: "qatar", label: "Qatar" },
  { value: "kuwait", label: "Kuwait" },
  { value: "oman", label: "Oman" },
  { value: "bahrain", label: "Bahrain" },
  { value: "other", label: "Other (custom)" },
] as const;

export type PrimaryRegionCode = (typeof PRIMARY_REGION_OPTIONS)[number]["value"];

/** Maps legacy `global` and unknown values to the default India/UAE focus. */
export function normalizePrimaryRegionCode(code: string | undefined): PrimaryRegionCode {
  const v = (code || "").trim().toLowerCase();
  if (v === "global") return DEFAULT_PRIMARY_REGION;
  if (v.includes(",")) {
    const parts = v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const hasIndia = parts.includes("india");
    const hasGulf = parts.some((p) => ["uae-gcc", "saudi-arabia", "qatar", "kuwait", "oman", "bahrain"].includes(p));
    if (hasIndia && hasGulf) return "uae-india";
    if (hasIndia) return "india";
    if (hasGulf) return "uae-gcc";
    if (parts.includes("other")) return "other";
  }
  const found = PRIMARY_REGION_OPTIONS.find((o) => o.value === v);
  return found ? found.value : DEFAULT_PRIMARY_REGION;
}

/** Default posting / profile timezone from primary market (matches backend). */
export function defaultTimeZoneForPrimaryRegion(region: string | undefined): string {
  const r = (region || DEFAULT_PRIMARY_REGION).trim().toLowerCase();
  if (r === "uae-gcc" || r === "saudi-arabia" || r === "qatar" || r === "kuwait" || r === "oman" || r === "bahrain") {
    return "Asia/Dubai";
  }
  return "Asia/Kolkata";
}

export function primaryRegionLabel(code: string | undefined): string {
  const found = PRIMARY_REGION_OPTIONS.find((o) => o.value === code);
  return found?.label ?? PRIMARY_REGION_OPTIONS[0].label;
}
