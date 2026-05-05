"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Globe2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { AI_MODEL_GROUPS, labelForAiModel } from "@/lib/ai-models";
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

function parseCompetitors(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => {
      const [name = "", website = "", focus = ""] = line.split(",").map((part) => part.trim());
      return { name, website, focus };
    })
    .filter((competitor) => competitor.name || competitor.website || competitor.focus);
}

function competitorsToText(competitors: { name: string; website: string; focus: string }[] | undefined) {
  return (competitors ?? [])
    .map((competitor) => [competitor.name, competitor.website, competitor.focus].filter(Boolean).join(", "))
    .join("\n");
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
  aiModel: string;
  setAiModel: (v: string) => void;
  competitors: string;
  setCompetitors: (v: string) => void;
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
  aiModel,
  setAiModel,
  competitors,
  setCompetitors,
}: SetupFormState) {
  const hasPrimaryRegion = (value: PrimaryRegionCode) => primaryRegions.includes(value);
  return (
    <>
      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <Building2 className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Organization</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}companyName`}>Company</Label>
            <Input
              id={`${idPrefix}companyName`}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your company"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}website`}>Website</Label>
            <Input
              id={`${idPrefix}website`}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://company.com"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Optional. If empty, the setup agent will try to infer the company website from the company name and scenario.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}scenario`}>Workspace scenario</Label>
          <select
            id={`${idPrefix}scenario`}
            value={scenario}
            onChange={(event) => selectScenario(event.target.value as WorkspaceScenario)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
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
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          )}
        </div>
        <div className="space-y-3 rounded-2xl border-2 border-blue-200/80 bg-gradient-to-b from-blue-50/90 to-white p-4 shadow-sm ring-1 ring-blue-100/60 dark:border-blue-900/60 dark:from-blue-950/30 dark:to-zinc-900 dark:ring-blue-900/40">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Globe2 className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2 pt-0.5">
              <Label htmlFor={`${idPrefix}primary-region`} className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Primary market
              </Label>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">AI research and content are scoped to this market (UAE and India only).</p>
              <div id={`${idPrefix}primary-region`} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PRIMARY_REGION_OPTIONS.map((opt) => {
                  const active = hasPrimaryRegion(opt.value as PrimaryRegionCode);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => togglePrimaryRegion(opt.value as PrimaryRegionCode)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                        active
                          ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                          : "border-blue-200 bg-white text-zinc-800 hover:border-blue-300 dark:border-blue-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-blue-700"
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                You can select multiple markets. System maps them to the best supported region automatically.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="space-y-2">
        <Label htmlFor={`${idPrefix}competitors`}>Competitor setup inputs (optional)</Label>
        <Textarea
          id={`${idPrefix}competitors`}
          value={competitors}
          onChange={(event) => setCompetitors(event.target.value)}
          placeholder={
            "One competitor per line: name, website, focus\nIf you add competitors, AI compares against them. If empty, AI discovers competitor categories automatically."
          }
          className="min-h-28 rounded-xl bg-white dark:bg-zinc-900"
        />
      </section>
    </>
  );
}

type SetupModalFormSnapshot = {
  companyName: string;
  website: string;
  scenario: WorkspaceScenario;
  customScenario: string;
  competitors: string;
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
      competitors: "",
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
      competitors: competitorsToText(editSetup.competitors),
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
  const [competitors, setCompetitors] = useState(snapshot.competitors);
  const [primaryRegions, setPrimaryRegions] = useState<PrimaryRegionCode[]>(snapshot.primaryRegions);
  const [customPrimaryMarket, setCustomPrimaryMarket] = useState(snapshot.customPrimaryMarket);
  const [aiModel, setAiModel] = useState(snapshot.aiModel);
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
    <>
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
        aiModel={aiModel}
        setAiModel={setAiModel}
        competitors={competitors}
        setCompetitors={setCompetitors}
      />
      <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="rounded-xl" disabled={saving} onClick={onRequestClose}>
          Cancel
        </Button>
        <Button
          className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
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
              competitors: parseCompetitors(competitors),
            })
              .then(() => {
                push(
                  mode === "edit"
                    ? "Workspace updated. Run Strategy/Generate in Workflow when ready."
                    : "Workspace saved. Start Strategy/Generate in Workflow when ready.",
                );
                onClose();
                router.replace("/pipeline?tab=command");
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
    </>
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
      <DialogContent className="max-h-[min(94vh,940px)] max-w-5xl overflow-y-auto rounded-2xl p-0 shadow-lg sm:max-w-5xl">
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

export default function WorkspaceSetupPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const setupWorkspace = useWorkspaceStore((s) => s.setupWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const removeWorkspaceSetup = useWorkspaceStore((s) => s.removeWorkspaceSetup);
  const deleteCurrentWorkspace = useWorkspaceStore((s) => s.deleteCurrentWorkspace);
  const clearAiOutputs = useWorkspaceStore((s) => s.clearAiOutputs);
  const { push } = useToast();

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <WorkspaceSetupForm
      workspace={workspace}
      workspaceSetups={workspaceSetups}
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
