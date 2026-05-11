"use client";

import { Building2, Globe2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRIMARY_REGION_OPTIONS, type PrimaryRegionCode } from "@/lib/primary-region";
import type { WorkspaceScenario } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CUSTOM_SCENARIO_VALUE = "__custom__";

export const WORKSPACE_SCENARIOS = [
  { value: "it-services", label: "IT Services" },
  { value: "b2b-saas", label: "B2B SaaS" },
  { value: "ecommerce", label: "Ecommerce" },
  { value: "agency", label: "Agency" },
  { value: "d2c-brand", label: "D2C Brand" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "logistics", label: "Logistics & Supply Chain" },
  { value: "travel-hospitality", label: "Travel & Hospitality" },
  { value: "automotive", label: "Automotive" },
  { value: "beauty-fashion", label: "Beauty & Fashion" },
  { value: "construction", label: "Construction & Infrastructure" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "real-estate", label: "Real Estate" },
  { value: "restaurant", label: "Restaurant / Food" },
  { value: "local-services", label: "Local Services" },
  { value: "finance", label: "Finance" },
  { value: "fitness", label: "Fitness / Wellness" },
  { value: CUSTOM_SCENARIO_VALUE, label: "Other" },
] as const;

export function isPresetScenario(value: string) {
  return WORKSPACE_SCENARIOS.some((option) => option.value === value && option.value !== CUSTOM_SCENARIO_VALUE);
}

export type WorkspaceSetupFieldsProps = {
  idPrefix: string;
  companyName: string;
  setCompanyName: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  /** First-time wizard requires a valid http(s) URL; modals stay optional but validate when filled. */
  websiteMode?: "optional" | "required";
  websiteError?: string | null;
  websiteOnBlur?: () => void;
  scenario: WorkspaceScenario;
  selectScenario: (value: WorkspaceScenario) => void;
  customScenario: string;
  setCustomScenario: (v: string) => void;
  primaryRegions: PrimaryRegionCode[];
  togglePrimaryRegion: (v: PrimaryRegionCode) => void;
  customPrimaryMarket: string;
  setCustomPrimaryMarket: (v: string) => void;
};

export function WorkspaceSetupFields({
  idPrefix,
  companyName,
  setCompanyName,
  website,
  setWebsite,
  websiteMode = "optional",
  websiteError,
  websiteOnBlur,
  scenario,
  selectScenario,
  customScenario,
  setCustomScenario,
  primaryRegions,
  togglePrimaryRegion,
  customPrimaryMarket,
  setCustomPrimaryMarket,
}: WorkspaceSetupFieldsProps) {
  const hasPrimaryRegion = (value: PrimaryRegionCode) => primaryRegions.includes(value);
  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-5 dark:border-zinc-800 dark:bg-zinc-900/35">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Organization</h3>
        </div>
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}companyName`}>Company</Label>
            <Input
              id={`${idPrefix}companyName`}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your company"
              className="rounded-lg"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}website`}>
              Website{websiteMode === "required" ? <span className="text-red-600"> *</span> : null}
            </Label>
            <Input
              id={`${idPrefix}website`}
              type="url"
              inputMode="url"
              autoComplete="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              onBlur={websiteOnBlur}
              placeholder="https://yourcompany.com"
              aria-invalid={Boolean(websiteError)}
              className={cn(
                "rounded-lg",
                websiteError && "border-red-500 focus-visible:ring-red-500/30",
              )}
            />
            {websiteError ? (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{websiteError}</p>
            ) : null}
          </div>
        </div>
        {websiteMode === "required" ? (
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Use your public site as a full URL: <span className="font-medium text-zinc-700 dark:text-zinc-300">https://</span>{" "}
            or <span className="font-medium text-zinc-700 dark:text-zinc-300">http://</span> plus your domain (example:{" "}
            <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300">https://acme.com</span>).
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Website is optional. If you add one, use <span className="font-medium text-zinc-700 dark:text-zinc-300">https://</span>{" "}
            or <span className="font-medium text-zinc-700 dark:text-zinc-300">http://</span> with your domain. If omitted,
            setup infers context from the company name and scenario where possible.
          </p>
        )}
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Competitor research runs from your company + website context to improve strategy accuracy.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}scenario`}>Workspace scenario</Label>
          <select
            id={`${idPrefix}scenario`}
            value={scenario}
            onChange={(event) => selectScenario(event.target.value as WorkspaceScenario)}
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
          >
            {WORKSPACE_SCENARIOS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {scenario === CUSTOM_SCENARIO_VALUE && (
            <Input
              value={customScenario}
              onChange={(event) => setCustomScenario(event.target.value)}
              placeholder="Type custom scenario and press Enter"
              maxLength={50}
              className="rounded-lg"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          )}
        </div>
        <div className="rounded-xl border border-blue-200/70 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/25">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white dark:bg-blue-500">
              <Globe2 className="size-[18px]" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <Label htmlFor={`${idPrefix}primary-region`} className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Primary market
                </Label>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  AI research and content use this market (UAE and India coverage).
                </p>
              </div>
              <div id={`${idPrefix}primary-region`} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PRIMARY_REGION_OPTIONS.map((opt) => {
                  const active = hasPrimaryRegion(opt.value as PrimaryRegionCode);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => togglePrimaryRegion(opt.value as PrimaryRegionCode)}
                      className={`min-h-10 rounded-lg border px-3 py-2.5 text-left text-sm leading-snug transition ${
                        active
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-500 dark:bg-blue-600"
                          : "border-zinc-200 bg-white text-zinc-800 hover:border-blue-300 hover:bg-blue-50/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-blue-700 dark:hover:bg-zinc-800/80"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {hasPrimaryRegion("other") && (
                <Input
                  value={customPrimaryMarket}
                  onChange={(e) => setCustomPrimaryMarket(e.target.value)}
                  placeholder="Type custom market and press Enter"
                  className="rounded-lg"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Multiple selections are combined; we map to the closest supported region.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
