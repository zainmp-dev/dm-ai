"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function WorkspaceSetupPage() {
  const router = useRouter();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setupWorkspace = useWorkspaceStore((s) => s.setupWorkspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const { push } = useToast();

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return (
    <WorkspaceSetupForm
      workspace={workspace}
      setupWorkspace={setupWorkspace}
      workspaceSetups={workspaceSetups}
      activeWorkspaceId={activeWorkspaceId}
      setActiveWorkspace={setActiveWorkspace}
      push={push}
      routerReplace={router.replace}
    />
  );
}

function WorkspaceSetupForm({
  workspace,
  setupWorkspace,
  workspaceSetups,
  activeWorkspaceId,
  setActiveWorkspace,
  push,
  routerReplace,
}: {
  workspace: NonNullable<ReturnType<typeof useWorkspaceStore.getState>["workspace"]>;
  setupWorkspace: ReturnType<typeof useWorkspaceStore.getState>["setupWorkspace"];
  workspaceSetups: ReturnType<typeof useWorkspaceStore.getState>["workspaceSetups"];
  activeWorkspaceId: ReturnType<typeof useWorkspaceStore.getState>["activeWorkspaceId"];
  setActiveWorkspace: ReturnType<typeof useWorkspaceStore.getState>["setActiveWorkspace"];
  push: (message: string) => void;
  routerReplace: (href: string) => void;
}) {
  const [companyName, setCompanyName] = useState(workspace.companyName || workspace.profile.company);
  const [website, setWebsite] = useState(workspace.companyWebsite);
  const [saving, setSaving] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Configured workspaces</CardTitle>
          <CardDescription>Switch workspace context to filter dashboard data, content queue, approvals, and analytics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workspaceSetups.length === 0 && <p className="text-sm text-slate-500">No workspace setup saved yet. Create your first workspace below.</p>}
          {workspaceSetups.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                void setActiveWorkspace(item.id).then(() => push(`Switched to workspace: ${item.companyName}`));
              }}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                item.id === activeWorkspaceId ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{item.companyName}</span>
                <span className="block truncate text-xs text-slate-500">
                  {item.website || "No website"} - {item.scenario}
                </span>
              </span>
              <span className={`rounded-full px-2 py-1 text-xs ${item.id === activeWorkspaceId ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                {item.id === activeWorkspaceId ? "Active" : "Switch"}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Configure your workspace</CardTitle>
          <CardDescription>Set up core organization details for this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company</Label>
                <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Northline Digital" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://company.com" />
              </div>
            </div>
          </section>

          <Button
            className="rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
            disabled={saving || !companyName.trim()}
            onClick={() => {
              setSaving(true);
              void setupWorkspace({
                companyName: companyName.trim(),
                website: website.trim(),
                scenario: workspace.workspaceScenario,
                workspaceOwnerName: workspace.profile.name || "Jordan Reeves",
                workspaceOwnerEmail: workspace.profile.email || "jordan.reeves@northline.co",
              })
                .then(() => {
                  push("Workspace setup saved and activated");
                  routerReplace("/dashboard");
                })
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "Applying setup..." : "Apply setup"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
