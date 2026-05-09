"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Globe2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { labelForAiModel } from "@/lib/ai-models";
import {
  PRIMARY_REGION_OPTIONS,
  normalizePrimaryRegionCode,
  primaryRegionLabel,
  type PrimaryRegionCode,
} from "@/lib/primary-region";
import type { WorkspaceScenario } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";

const CUSTOM_SCENARIO_VALUE = "__custom__";

const WORKSPACE_SCENARIOS = [
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
];

function isPresetScenario(value: string) {
  return WORKSPACE_SCENARIOS.some((option) => option.value === value && option.value !== CUSTOM_SCENARIO_VALUE);
}

type SetupFormState = {
  companyName: string;
  setCompanyName: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  scenario: WorkspaceScenario;
  selectScenario: (value: WorkspaceScenario) => void;
  customScenario: string;
  setCustomScenario: (v: string) => void;
  primaryRegions: PrimaryRegionCode[];
  togglePrimaryRegion: (v: PrimaryRegionCode) => void;
  customPrimaryMarket: string;
  setCustomPrimaryMarket: (v: string) => void;
  idPrefix: string;
};

function WorkspaceSetupFields({
  idPrefix,
  companyName,
  setCompanyName,
  website,
  setWebsite,
  scenario,
  selectScenario,
  customScenario,
  setCustomScenario,
  primaryRegions,
  togglePrimaryRegion,
  customPrimaryMarket,
  setCustomPrimaryMarket,
}: SetupFormState) {
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
            <Label htmlFor={`${idPrefix}website`}>Website</Label>
            <Input
              id={`${idPrefix}website`}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://company.com"
              className="rounded-lg"
            />
          </div>
        </div>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Website is optional. If omitted, setup infers it from the company name and scenario.
        </p>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Competitor research now runs from your company + website context to reduce misconfigured seed data and improve strategy accuracy.
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

type SetupModalFormSnapshot = {
  companyName: string;
  website: string;
  scenario: WorkspaceScenario;
  customScenario: string;
  primaryRegions: PrimaryRegionCode[];
  customPrimaryMarket: string;
  aiModel: string;
};

function buildSetupModalFormSnapshot(
  mode: "new" | "edit",
  editSetup: ReturnType<typeof useWorkspaceStore.getState>["workspaceSetups"][number] | undefined,
  selectedAiModel: string,
): SetupModalFormSnapshot {
  if (mode === "new") {
    return {
      companyName: "",
      website: "",
      scenario: "b2b-saas",
      customScenario: "",
      primaryRegions: [normalizePrimaryRegionCode(undefined)],
      customPrimaryMarket: "",
      aiModel: selectedAiModel,
    };
  }
  if (editSetup) {
    return {
      companyName: editSetup.companyName,
      website: editSetup.website,
      scenario: (isPresetScenario(editSetup.scenario) ? editSetup.scenario : CUSTOM_SCENARIO_VALUE) as WorkspaceScenario,
      customScenario: isPresetScenario(editSetup.scenario) ? "" : editSetup.scenario,
      primaryRegions: [normalizePrimaryRegionCode(editSetup.primaryRegion)],
      customPrimaryMarket: "",
      aiModel: editSetup.aiModel,
    };
  }
  return buildSetupModalFormSnapshot("new", undefined, selectedAiModel);
}

function SetupWorkspaceModalFormInner({
  mode,
  snapshot,
  editSetup,
  workspace,
  setupWorkspace,
  push,
  onClose,
  onRequestClose,
}: {
  mode: "new" | "edit";
  snapshot: SetupModalFormSnapshot;
  editSetup?: ReturnType<typeof useWorkspaceStore.getState>["workspaceSetups"][number];
  workspace: NonNullable<ReturnType<typeof useWorkspaceStore.getState>["workspace"]>;
  setupWorkspace: ReturnType<typeof useWorkspaceStore.getState>["setupWorkspace"];
  push: (message: string) => void;
  onClose: () => void;
  onRequestClose: () => void;
}) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(snapshot.companyName);
  const [website, setWebsite] = useState(snapshot.website);
  const [scenario, setScenario] = useState<WorkspaceScenario>(snapshot.scenario);
  const [customScenario, setCustomScenario] = useState(snapshot.customScenario);
  const [primaryRegions, setPrimaryRegions] = useState<PrimaryRegionCode[]>(snapshot.primaryRegions);
  const [customPrimaryMarket, setCustomPrimaryMarket] = useState(snapshot.customPrimaryMarket);
  const [aiModel] = useState(snapshot.aiModel);
  const [saving, setSaving] = useState(false);
  const selectedScenario = scenario === CUSTOM_SCENARIO_VALUE ? customScenario.trim() : scenario;
  const idPrefix = mode === "new" ? "new-" : "edit-";
  const togglePrimaryRegion = (value: PrimaryRegionCode) => {
    setPrimaryRegions((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((v) => v !== value);
        return next.length ? next : [normalizePrimaryRegionCode(undefined)];
      }
      return [...prev, value];
    });
  };

  const effectivePrimaryRegion = (() => {
    const values = Array.from(new Set(primaryRegions));
    if (values.includes("india") && values.some((v) => ["uae-gcc", "saudi-arabia", "qatar", "kuwait", "oman", "bahrain"].includes(v))) {
      return "uae-india";
    }
    if (values.includes("india")) return "india";
    if (values.some((v) => ["uae-gcc", "saudi-arabia", "qatar", "kuwait", "oman", "bahrain"].includes(v))) return "uae-gcc";
    if (values.includes("other")) return customPrimaryMarket.trim() ? "other" : "other";
    return normalizePrimaryRegionCode(undefined);
  })();

  const selectScenario = (value: WorkspaceScenario) => {
    setScenario(value);
    if (value !== CUSTOM_SCENARIO_VALUE) {
      setCustomScenario("");
    }
  };

  return (
    <div className="relative">
      <WorkspaceSetupFields
        idPrefix={idPrefix}
        companyName={companyName}
        setCompanyName={setCompanyName}
        website={website}
        setWebsite={setWebsite}
        scenario={scenario}
        selectScenario={selectScenario}
        customScenario={customScenario}
        setCustomScenario={setCustomScenario}
        primaryRegions={primaryRegions}
        togglePrimaryRegion={togglePrimaryRegion}
        customPrimaryMarket={customPrimaryMarket}
        setCustomPrimaryMarket={setCustomPrimaryMarket}
      />
      <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 pt-5 dark:border-zinc-800 sm:flex-row sm:justify-end sm:gap-3">
        <Button type="button" variant="outline" className="rounded-lg" disabled={saving} onClick={onRequestClose}>
          Cancel
        </Button>
        <Button
          className="rounded-lg bg-blue-700 font-semibold text-white shadow-sm hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          aria-busy={saving}
          disabled={saving || !companyName.trim() || !selectedScenario || (mode === "edit" && !editSetup)}
          onClick={() => {
            setSaving(true);
            void setupWorkspace({
              workspaceId: mode === "edit" ? editSetup?.id : undefined,
              companyName: companyName.trim(),
              website: website.trim(),
              scenario: selectedScenario,
              primaryRegion: effectivePrimaryRegion,
              workspaceOwnerName: workspace.profile.name,
              workspaceOwnerEmail: workspace.profile.email,
              aiModel,
              // Keep competitor discovery fully AI-driven from company/site + scenario to avoid stale manual seed issues.
              competitors: [],
            })
              .then(() => {
                push(
                  mode === "edit"
                    ? "Workspace updated. Run Strategy/Generate in Workflow when ready."
                    : "Workspace saved. Start Strategy/Generate in Workflow when ready.",
                );
                onClose();
                router.replace("/pipeline");
              })
              .finally(() => setSaving(false));
          }}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              Saving workspace...
            </>
          ) : (
            "Save workspace"
          )}
        </Button>
      </div>
      {saving ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/85 backdrop-blur-sm dark:bg-zinc-950/80">
          <div className="w-full max-w-sm rounded-2xl border border-blue-200 bg-white px-6 py-7 text-center shadow-lg dark:border-blue-900/60 dark:bg-zinc-900">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
              <Loader2 className="size-6 animate-spin" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI is setting up your workspace</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Generating your setup and preparing workflow...</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SetupWorkspaceModal({
  open,
  onOpenChange,
  mode,
  formResetKey,
  workspace,
  selectedAiModel,
  setupWorkspace,
  push,
  editSetup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "new" | "edit";
  formResetKey: number;
  workspace: NonNullable<ReturnType<typeof useWorkspaceStore.getState>["workspace"]>;
  selectedAiModel: string;
  setupWorkspace: ReturnType<typeof useWorkspaceStore.getState>["setupWorkspace"];
  push: (message: string) => void;
  editSetup?: ReturnType<typeof useWorkspaceStore.getState>["workspaceSetups"][number];
}) {
  const snapshot = buildSetupModalFormSnapshot(mode, editSetup, selectedAiModel);

  const title = mode === "new" ? "New workspace" : "Update setup";
  const description =
    mode === "new"
      ? "Add a company, market, and options below. Switch the active workspace from the list after saving."
      : "Changes apply to this saved setup. Save now, then run Strategy/Generate from Workflow.";

  const canShowForm = mode === "new" || Boolean(editSetup);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] w-full overflow-y-auto rounded-none p-0 shadow-lg sm:max-h-[min(94vh,940px)] sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader className="space-y-1 border-b border-zinc-100 px-6 pb-4 pt-6 text-left dark:border-zinc-800 sm:px-8 sm:pt-8">
          <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 px-6 pb-6 sm:px-8 sm:pb-8">
          {open && canShowForm ? (
            <SetupWorkspaceModalFormInner
              key={formResetKey}
              mode={mode}
              snapshot={snapshot}
              editSetup={editSetup}
              workspace={workspace}
              setupWorkspace={setupWorkspace}
              push={push}
              onClose={() => onOpenChange(false)}
              onRequestClose={() => onOpenChange(false)}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FirstWorkspaceSetup({
  workspace,
  selectedAiModel,
  setupWorkspace,
  push,
}: {
  workspace: NonNullable<ReturnType<typeof useWorkspaceStore.getState>["workspace"]>;
  selectedAiModel: ReturnType<typeof useWorkspaceStore.getState>["selectedAiModel"];
  setupWorkspace: ReturnType<typeof useWorkspaceStore.getState>["setupWorkspace"];
  push: (message: string) => void;
}) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [scenario, setScenario] = useState<WorkspaceScenario>("it-services");
  const [customScenario, setCustomScenario] = useState("");
  const [primaryRegions, setPrimaryRegions] = useState<PrimaryRegionCode[]>([normalizePrimaryRegionCode(undefined)]);
  const [customPrimaryMarket, setCustomPrimaryMarket] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedScenario = scenario === CUSTOM_SCENARIO_VALUE ? customScenario.trim() : scenario;

  const effectivePrimaryRegion = (() => {
    const values = Array.from(new Set(primaryRegions));
    if (values.includes("india") && values.some((v) => ["uae-gcc", "saudi-arabia", "qatar", "kuwait", "oman", "bahrain"].includes(v))) return "uae-india";
    if (values.includes("india")) return "india";
    if (values.some((v) => ["uae-gcc", "saudi-arabia", "qatar", "kuwait", "oman", "bahrain"].includes(v))) return "uae-gcc";
    return normalizePrimaryRegionCode(undefined);
  })();

  const togglePrimaryRegion = (value: PrimaryRegionCode) => {
    setPrimaryRegions((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((v) => v !== value);
        return next.length ? next : [normalizePrimaryRegionCode(undefined)];
      }
      return [...prev, value];
    });
  };

  const handleSave = () => {
    if (!companyName.trim() || !selectedScenario) return;
    setSaving(true);
    void setupWorkspace({
      companyName: companyName.trim(),
      website: website.trim(),
      scenario: selectedScenario,
      primaryRegion: effectivePrimaryRegion,
      workspaceOwnerName: workspace.profile.name,
      workspaceOwnerEmail: workspace.profile.email,
      aiModel: selectedAiModel,
      competitors: [],
    })
      .then(() => {
        push("Workspace saved. Start Strategy/Generate in Workflow when ready.");
        router.replace("/pipeline");
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-0 sm:px-2">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Sparkles className="size-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Set up your workspace</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Tell us about your company so AI can tailor your content strategy.</p>
        </div>
      </div>

      {/* Form card */}
      <div className="relative rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-6 p-5 sm:p-7">
          <WorkspaceSetupFields
            idPrefix="first-"
            companyName={companyName}
            setCompanyName={setCompanyName}
            website={website}
            setWebsite={setWebsite}
            scenario={scenario}
            selectScenario={(v) => { setScenario(v); if (v !== CUSTOM_SCENARIO_VALUE) setCustomScenario(""); }}
            customScenario={customScenario}
            setCustomScenario={setCustomScenario}
            primaryRegions={primaryRegions}
            togglePrimaryRegion={togglePrimaryRegion}
            customPrimaryMarket={customPrimaryMarket}
            setCustomPrimaryMarket={setCustomPrimaryMarket}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-zinc-100 px-5 py-4 dark:border-zinc-800 sm:px-7">
          <Button
            type="button"
            disabled={saving || !companyName.trim() || !selectedScenario}
            onClick={handleSave}
            className="w-full rounded-xl bg-blue-600 font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                Setting up…
              </>
            ) : (
              "Save & continue"
            )}
          </Button>
        </div>

        {/* Saving overlay */}
        {saving && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/85 backdrop-blur-sm dark:bg-zinc-950/80">
            <div className="w-full max-w-xs rounded-2xl border border-blue-200 bg-white px-6 py-7 text-center shadow-lg dark:border-blue-900/60 dark:bg-zinc-900">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
                <Loader2 className="size-6 animate-spin" aria-hidden />
              </div>
              <p className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI is setting up your workspace</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Generating your setup and preparing workflow…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkspaceSetupPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const workspaceHydrated = useWorkspaceStore((s) => s.workspaceHydrated);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const setupWorkspace = useWorkspaceStore((s) => s.setupWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const removeWorkspaceSetup = useWorkspaceStore((s) => s.removeWorkspaceSetup);
  const deleteCurrentWorkspace = useWorkspaceStore((s) => s.deleteCurrentWorkspace);
  const clearAiOutputs = useWorkspaceStore((s) => s.clearAiOutputs);
  const { push } = useToast();

  if (!workspace) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <WorkspaceSetupForm
      workspace={workspace}
      workspaceSetups={workspaceSetups}
      workspaceHydrated={workspaceHydrated}
      activeWorkspaceId={activeWorkspaceId}
      selectedAiModel={selectedAiModel}
      setupWorkspace={setupWorkspace}
      setActiveWorkspace={setActiveWorkspace}
      removeWorkspaceSetup={removeWorkspaceSetup}
      deleteCurrentWorkspace={deleteCurrentWorkspace}
      clearAiOutputs={clearAiOutputs}
      push={push}
    />
  );
}

function WorkspaceSetupForm({
  workspace,
  workspaceSetups,
  workspaceHydrated,
  activeWorkspaceId,
  selectedAiModel,
  setupWorkspace,
  setActiveWorkspace,
  removeWorkspaceSetup,
  deleteCurrentWorkspace,
  clearAiOutputs,
  push,
}: {
  workspace: NonNullable<ReturnType<typeof useWorkspaceStore.getState>["workspace"]>;
  workspaceSetups: ReturnType<typeof useWorkspaceStore.getState>["workspaceSetups"];
  workspaceHydrated: ReturnType<typeof useWorkspaceStore.getState>["workspaceHydrated"];
  activeWorkspaceId: ReturnType<typeof useWorkspaceStore.getState>["activeWorkspaceId"];
  selectedAiModel: ReturnType<typeof useWorkspaceStore.getState>["selectedAiModel"];
  setupWorkspace: ReturnType<typeof useWorkspaceStore.getState>["setupWorkspace"];
  setActiveWorkspace: ReturnType<typeof useWorkspaceStore.getState>["setActiveWorkspace"];
  removeWorkspaceSetup: ReturnType<typeof useWorkspaceStore.getState>["removeWorkspaceSetup"];
  deleteCurrentWorkspace: ReturnType<typeof useWorkspaceStore.getState>["deleteCurrentWorkspace"];
  clearAiOutputs: ReturnType<typeof useWorkspaceStore.getState>["clearAiOutputs"];
  push: (message: string) => void;
}) {
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceFormKey, setNewWorkspaceFormKey] = useState(0);
  const [editWorkspaceOpen, setEditWorkspaceOpen] = useState(false);
  const [editWorkspaceFormKey, setEditWorkspaceFormKey] = useState(0);
  const [clearAiLoading, setClearAiLoading] = useState(false);
  const [setupBeingEdited, setSetupBeingEdited] = useState<ReturnType<typeof useWorkspaceStore.getState>["workspaceSetups"][number] | null>(
    null,
  );

  const openNewWorkspaceModal = () => {
    setNewWorkspaceFormKey((k) => k + 1);
    setNewWorkspaceOpen(true);
  };

  const openEditModal = (setup: (typeof workspaceSetups)[number]) => {
    setSetupBeingEdited(setup);
    setEditWorkspaceFormKey((k) => k + 1);
    setEditWorkspaceOpen(true);
  };

  const closeEditModal = (open: boolean) => {
    setEditWorkspaceOpen(open);
    if (!open) {
      setSetupBeingEdited(null);
    }
  };

  const setupForEditModal =
    setupBeingEdited && workspaceSetups.some((s) => s.id === setupBeingEdited.id)
      ? workspaceSetups.find((s) => s.id === setupBeingEdited.id) ?? setupBeingEdited
      : setupBeingEdited;

  // Still fetching workspace from backend — show spinner to avoid flash
  if (!workspaceHydrated && workspaceSetups.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  // New user: no setups yet — show inline first-setup form (no modal needed)
  if (workspaceHydrated && workspaceSetups.length === 0) {
    return (
      <FirstWorkspaceSetup
        workspace={workspace}
        selectedAiModel={selectedAiModel}
        setupWorkspace={setupWorkspace}
        push={push}
      />
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Workspace setups</CardTitle>
            <CardDescription>
              Switch active workspace, edit details in a modal, or add a new setup with{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">New workspace</span>.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspace.workspaceConfigured && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={clearAiLoading}
                  onClick={() => {
                    setClearAiLoading(true);
                    void clearAiOutputs()
                      .then(() =>
                        push(
                          "Cleared saved strategy, competitors, and drafts. Use Command Center to run Agent 1 and Agent 2 again.",
                        ),
                      )
                      .catch((e) => push(e instanceof Error ? e.message : "Could not clear AI outputs"))
                      .finally(() => setClearAiLoading(false));
                  }}
                >
                  {clearAiLoading ? "Clearing…" : "Clear AI library"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl text-red-600 hover:text-red-700"
                  onClick={() => {
                    void deleteCurrentWorkspace().then(() => {
                      setNewWorkspaceOpen(false);
                      closeEditModal(false);
                      push("Current workspace removed from database");
                    });
                  }}
                >
                  Clear current workspace
                </Button>
              </>
            )}
            <Button type="button" variant="default" className="rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={openNewWorkspaceModal}>
              New workspace
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {workspaceSetups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900/30 md:col-span-2">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">No saved setups yet</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Create your first workspace, then start AI from Workflow.</p>
              <Button type="button" className="mt-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={openNewWorkspaceModal}>
                New workspace
              </Button>
            </div>
          )}
          {workspaceSetups.map((setup) => {
            const editModalActive = editWorkspaceOpen && setupForEditModal?.id === setup.id;
            return (
              <div
                key={setup.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow dark:bg-zinc-900 ${
                  editModalActive
                    ? "border-blue-300 ring-2 ring-blue-100 dark:border-blue-700 dark:ring-blue-900/60"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{setup.companyName}</p>
                    <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{setup.website || "No website"}</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{setup.scenario}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        <Globe2 className="size-3 shrink-0" aria-hidden />
                        {primaryRegionLabel(setup.primaryRegion)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">Model: {labelForAiModel(setup.aiModel)}</p>
                  </div>
                  {setup.id === activeWorkspaceId ? (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                      Active
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="rounded-xl" onClick={() => void setActiveWorkspace(setup.id)}>
                    Use
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => openEditModal(setup)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-xl text-red-600 hover:text-red-700"
                    onClick={() => {
                      void removeWorkspaceSetup(setup.id).then(() => {
                        if (setupBeingEdited?.id === setup.id) {
                          closeEditModal(false);
                        }
                        push("Workspace setup deleted");
                      });
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <SetupWorkspaceModal
        open={newWorkspaceOpen}
        onOpenChange={setNewWorkspaceOpen}
        mode="new"
        formResetKey={newWorkspaceFormKey}
        workspace={workspace}
        selectedAiModel={selectedAiModel}
        setupWorkspace={setupWorkspace}
        push={push}
      />

      <SetupWorkspaceModal
        open={editWorkspaceOpen}
        onOpenChange={closeEditModal}
        mode="edit"
        formResetKey={editWorkspaceFormKey}
        workspace={workspace}
        selectedAiModel={selectedAiModel}
        setupWorkspace={setupWorkspace}
        push={push}
        editSetup={setupForEditModal ?? undefined}
      />
    </div>
  );
}
