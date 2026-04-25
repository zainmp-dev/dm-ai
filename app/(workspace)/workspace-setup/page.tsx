"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { AI_MODEL_OPTIONS } from "@/lib/ai-models";
import { PRIMARY_REGION_OPTIONS, primaryRegionLabel, type PrimaryRegionCode } from "@/lib/primary-region";
import type { WorkspaceScenario } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";

const CUSTOM_SCENARIO_VALUE = "__custom__";

const WORKSPACE_SCENARIOS = [
  { value: "b2b-saas", label: "B2B SaaS" },
  { value: "ecommerce", label: "Ecommerce" },
  { value: "agency", label: "Agency" },
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

export default function WorkspaceSetupPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const setupWorkspace = useWorkspaceStore((s) => s.setupWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const removeWorkspaceSetup = useWorkspaceStore((s) => s.removeWorkspaceSetup);
  const deleteCurrentWorkspace = useWorkspaceStore((s) => s.deleteCurrentWorkspace);
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
  push: (message: string) => void;
}) {
  const router = useRouter();
  const activeSetup = workspaceSetups.find((setup) => setup.id === activeWorkspaceId);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | undefined>(activeWorkspaceId ?? undefined);
  const initialScenario = activeSetup?.scenario ?? workspace.workspaceScenario;
  const [companyName, setCompanyName] = useState(activeSetup?.companyName || workspace.companyName || workspace.profile.company);
  const [website, setWebsite] = useState(activeSetup?.website ?? workspace.companyWebsite);
  const [scenario, setScenario] = useState<WorkspaceScenario>(isPresetScenario(initialScenario) ? initialScenario : CUSTOM_SCENARIO_VALUE);
  const [customScenario, setCustomScenario] = useState(isPresetScenario(initialScenario) ? "" : initialScenario);
  const [competitors, setCompetitors] = useState(competitorsToText(activeSetup?.competitors));
  const validRegion = (v: string | undefined): PrimaryRegionCode =>
    PRIMARY_REGION_OPTIONS.some((o) => o.value === v) ? (v as PrimaryRegionCode) : "global";
  const [primaryRegion, setPrimaryRegion] = useState<PrimaryRegionCode>(
    validRegion(activeSetup?.primaryRegion ?? workspace.primaryRegion),
  );
  const [aiModel, setAiModel] = useState(activeSetup?.aiModel ?? selectedAiModel);
  const [saving, setSaving] = useState(false);
  const selectedScenario = scenario === CUSTOM_SCENARIO_VALUE ? customScenario.trim() : scenario;

  const resetForm = () => {
    setEditingWorkspaceId(undefined);
    setCompanyName("");
    setWebsite("");
    setScenario("b2b-saas");
    setCustomScenario("");
    setCompetitors("");
    setPrimaryRegion("global");
    setAiModel(selectedAiModel);
  };

  const editSetup = (setup: (typeof workspaceSetups)[number]) => {
    setEditingWorkspaceId(setup.id);
    setCompanyName(setup.companyName);
    setWebsite(setup.website);
    setScenario(isPresetScenario(setup.scenario) ? setup.scenario : CUSTOM_SCENARIO_VALUE);
    setCustomScenario(isPresetScenario(setup.scenario) ? "" : setup.scenario);
    setCompetitors(competitorsToText(setup.competitors));
    setPrimaryRegion(validRegion(setup.primaryRegion));
    setAiModel(setup.aiModel);
  };

  const selectScenario = (value: WorkspaceScenario) => {
    setScenario(value);
    if (value !== CUSTOM_SCENARIO_VALUE) {
      setCustomScenario("");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Workspace setups</CardTitle>
            <CardDescription>Create multiple workspaces, switch between them, edit setup details, or delete local setup entries.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspace.workspaceConfigured && (
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl text-red-600 hover:text-red-700"
                onClick={() => {
                  void deleteCurrentWorkspace().then(() => {
                    resetForm();
                    push("Current workspace removed from database");
                  });
                }}
              >
                Clear current workspace
              </Button>
            )}
            <Button type="button" variant="outline" className="rounded-xl" onClick={resetForm}>
              New workspace
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {workspaceSetups.length === 0 && <p className="text-sm text-slate-500 md:col-span-2">No saved workspace setups yet.</p>}
          {workspaceSetups.map((setup) => (
            <div key={setup.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{setup.companyName}</p>
                  <p className="truncate text-sm text-slate-500">{setup.website || "No website"}</p>
                  <p className="mt-1 text-xs text-slate-500">{setup.scenario}</p>
                  <p className="mt-1 text-xs text-slate-600">Region: {primaryRegionLabel(setup.primaryRegion)}</p>
                  <p className="mt-1 text-xs text-blue-700">
                    Model: {AI_MODEL_OPTIONS.find((model) => model.value === setup.aiModel)?.label ?? setup.aiModel}
                  </p>
                </div>
                {setup.id === activeWorkspaceId && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">Active</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" className="rounded-xl" onClick={() => void setActiveWorkspace(setup.id)}>
                  Use
                </Button>
                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => editSetup(setup)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-red-600 hover:text-red-700"
                  onClick={() => {
                    void removeWorkspaceSetup(setup.id).then(() => {
                      if (editingWorkspaceId === setup.id) {
                        resetForm();
                      }
                      push("Workspace setup deleted");
                    });
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{editingWorkspaceId ? "Edit workspace setup" : "Configure your workspace"}</CardTitle>
          <CardDescription>Set up the core organization details, model router, and AI research inputs used across FlowPilot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company</Label>
                <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your company" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://company.com" />
              <p className="text-xs text-slate-500">Optional. If empty, the setup agent will try to infer the company website from the company name and scenario.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scenario">Workspace scenario</Label>
              <select
                id="scenario"
                value={scenario}
                onChange={(event) => selectScenario(event.target.value as WorkspaceScenario)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none"
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
                  placeholder="Type your workspace scenario"
                  maxLength={50}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="primary-region">Primary market (AI &amp; research)</Label>
              <select
                id="primary-region"
                value={primaryRegion}
                onChange={(e) => setPrimaryRegion(e.target.value as PrimaryRegionCode)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none"
              >
                {PRIMARY_REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Agent 1 (strategy) and content use this for GCC, India, or cross-border nuance. Default timezone: UAE → Dubai, India / UAE+India → India (adjust in profile if needed).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aiModel">AI model router</Label>
              <select
                id="aiModel"
                value={aiModel}
                onChange={(event) => setAiModel(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none"
              >
                {AI_MODEL_OPTIONS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">This model is saved with the workspace and used for setup research, competitor analysis, and content generation.</p>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Automatic AI flow</p>
              <p className="mt-1 text-sm text-blue-900">
                After setup, FlowPilot creates the master workspace automatically: Agent 1 finds or studies the domain, researches competitors, positioning, feature gaps, and marketing gap issues. Agent 2 uses that strategy output to draft content.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="competitors">Competitor setup inputs (optional)</Label>
              <Textarea
                id="competitors"
                value={competitors}
                onChange={(event) => setCompetitors(event.target.value)}
                placeholder={"One competitor per line: name, website, focus\nIf you add competitors, AI compares against them. If empty, AI discovers competitor categories automatically."}
                className="min-h-28 rounded-xl bg-white"
              />
            </div>
          </section>

          <Button
            className="rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
            disabled={saving || !companyName.trim() || !selectedScenario}
            onClick={() => {
              setSaving(true);
              void setupWorkspace({
                workspaceId: editingWorkspaceId,
                companyName: companyName.trim(),
                website: website.trim(),
                scenario: selectedScenario,
                primaryRegion,
                workspaceOwnerName: workspace.profile.name,
                workspaceOwnerEmail: workspace.profile.email,
                aiModel,
                competitors: parseCompetitors(competitors),
              })
                .then(() => {
                  push(editingWorkspaceId ? "Workspace updated. AI flow reran setup research." : "Workspace saved. AI flow completed initial research.");
                  router.replace("/command-center");
                })
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "Starting AI flow..." : "Save setup and start AI flow"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
