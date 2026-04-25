"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { platformLabel } from "@/lib/platform";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function SettingsPage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const loading = useWorkspaceStore((s) => s.loading);
  const connectLinkedin = useWorkspaceStore((s) => s.connectLinkedin);
  const connectMeta = useWorkspaceStore((s) => s.connectMeta);
  const savePreferences = useWorkspaceStore((s) => s.savePreferences);
  const { push } = useToast();

  if (!workspace && loading) {
    return <Skeleton className="h-[640px] w-full max-w-3xl rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  const { linkedin, meta } = workspace.integrations;
  const prefs = workspace.preferences;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Settings</h2>
        <p className="text-sm text-zinc-500">Integrations, credentials, posting defaults, and workspace controls.</p>
      </div>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Workspace scenario</CardTitle>
          <CardDescription>
            Current scenario: <span className="font-medium text-zinc-800">{workspace.workspaceScenario}</span>. Reconfigure in Workspace Setup.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
          <CardDescription>Connect social accounts used for publishing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-zinc-900">LinkedIn</p>
              <p className="text-sm text-zinc-500">{linkedin.connected ? "Connected" : "Not connected"}</p>
              {linkedin.connected && (
                <p className="mt-2 text-xs text-zinc-600">
                  {linkedin.accountName} · @{linkedin.accountHandle}
                </p>
              )}
            </div>
            <Button type="button" variant={linkedin.connected ? "secondary" : "default"} className="rounded-xl sm:w-40" onClick={() => void connectLinkedin().then(() => push("LinkedIn connected"))}>
              {linkedin.connected ? "Reconnect" : "Connect"}
            </Button>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-zinc-900">Meta (Facebook + Instagram)</p>
              <p className="text-sm text-zinc-500">{meta.connected ? "Connected" : "Not connected"}</p>
              {meta.connected && (
                <p className="mt-2 text-xs text-zinc-600">
                  {meta.accountName} · @{meta.accountHandle}
                </p>
              )}
            </div>
            <Button type="button" variant={meta.connected ? "secondary" : "default"} className="rounded-xl sm:w-40" onClick={() => void connectMeta().then(() => push("Meta connected"))}>
              {meta.connected ? "Reconnect" : "Connect"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>Mock credentials for internal tooling.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Workspace secret</Label>
            <Input readOnly value="mcc_live_****************************9f2a" className="rounded-xl font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label>Automation token</Label>
            <Input readOnly value="mcc_atok_****************************c71d" className="rounded-xl font-mono text-xs" />
          </div>
          <p className="text-xs text-zinc-500">Rotate keys from your security console (simulated).</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Posting preferences</CardTitle>
          <CardDescription>Defaults for bulk actions and digest behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default platform</Label>
            <div className="flex flex-wrap gap-2">
              {(["linkedin", "instagram", "facebook"] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={prefs.defaultPlatform === p ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => void savePreferences({ defaultPlatform: p }).then(() => push("Preference saved"))}
                >
                  {platformLabel(p)}
                </Button>
              ))}
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-900">Quiet hours</p>
              <p className="text-xs text-zinc-500">Avoid scheduling during off-hours (simulated).</p>
            </div>
            <Button
              type="button"
              variant={prefs.quietHoursEnabled ? "default" : "outline"}
              size="sm"
              className="rounded-xl"
              onClick={() => void savePreferences({ quietHoursEnabled: !prefs.quietHoursEnabled }).then(() => push("Updated"))}
            >
              {prefs.quietHoursEnabled ? "On" : "Off"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-900">Approval digest</p>
              <p className="text-xs text-zinc-500">How notifications are grouped.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-xl"
              onClick={() =>
                void savePreferences({ approvalDigest: prefs.approvalDigest === "daily" ? "instant" : "daily" }).then(() => push("Updated"))
              }
            >
              {prefs.approvalDigest === "daily" ? "Daily" : "Instant"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
