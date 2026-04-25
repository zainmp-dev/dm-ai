/** Stored in backend as `primary_region`; drives AI region context (GCC, India, etc.). */
export const PRIMARY_REGION_OPTIONS = [
  { value: "global", label: "Global" },
  { value: "uae-gcc", label: "UAE & GCC" },
  { value: "india", label: "India" },
  { value: "uae-india", label: "UAE + India" },
] as const;

export type PrimaryRegionCode = (typeof PRIMARY_REGION_OPTIONS)[number]["value"];

export function primaryRegionLabel(code: string | undefined): string {
  const found = PRIMARY_REGION_OPTIONS.find((o) => o.value === code);
  return found?.label ?? "Global";
}
