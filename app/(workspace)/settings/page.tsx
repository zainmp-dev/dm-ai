"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Globe2, KeyRound, Link2, LayoutGrid, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { labelForAiModel } from "@/lib/ai-models";
import { platformLabel } from "@/lib/platform";
import { primaryRegionLabel } from "@/lib/primary-region";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";
import Link from "next/link";

const SECTIONS = [
  { id: "overview" as const, label: "Overview", short: "Workspace", icon: LayoutGrid },
  { id: "integrations" as const, label: "Integrations", short: "Social", icon: Link2 },
  { id: "security" as const, label: "API & security", short: "API", icon: KeyRound },
  { id: "preferences" as const, label: "Preferences", short: "Defaults", icon: SlidersHorizontal },
];

const SECTION_PARAM_IDS: (typeof SECTIONS)[number]["id"][] = ["overview", "integrations", "security", "preferences"];

function isSectionId(value: string | null): value is (typeof SECTIONS)[number]["id"] {
  return Boolean(value && SECTION_PARAM_IDS.includes(value as (typeof SECTIONS)[number]["id"]));
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const loading = useWorkspaceStore((s) => s.loading);
  const connectLinkedin = useWorkspaceStore((s) => s.connectLinkedin);
  const connectMeta = useWorkspaceStore((s) => s.connectMeta);
  const savePreferences = useWorkspaceStore((s) => s.savePreferences);
  const { push } = useToast();
  const [active, setActive] = useState<(typeof SECTIONS)[number]["id"]>("overview");

  useEffect(() => {
    const section = searchParams.get("section");
    if (isSectionId(section)) {
      setActive(section);
    }
  }, [searchParams]);

  if (!workspace && loading) {
    return <Skeleton className="h-[min(640px,85dvh)] w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  const { linkedin, meta } = workspace.integrations;
  const prefs = workspace.preferences;
  const activeSetup = activeWorkspaceId ? workspaceSetups.find((s) => s.id === activeWorkspaceId) : undefined;
  const displayCompany = activeSetup?.companyName?.trim() || workspace.companyName?.trim() || workspace.profile.company || "—";
  const displayWebsite = activeSetup?.website?.trim() || workspace.companyWebsite?.trim() || "";
  const displayScenario = activeSetup?.scenario ?? workspace.workspaceScenario;
  const displayRegion = primaryRegionLabel(activeSetup?.primaryRegion ?? workspace.primaryRegion);
  const displayModel = labelForAiModel(activeSetup?.aiModel ?? selectedAiModel);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:sticky lg:top-1 lg:w-64 lg:shrink-0">
        <nav className="flex flex-col gap-1.5 rounded-2xl border border-zinc-200/90 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[15px] font-medium leading-snug transition-colors",
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/80",
                )}
              >
                <Icon className="size-[18px] shrink-0 opacity-90" />
                <span className="min-w-0">
                  <span className="block leading-tight">{s.label}</span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[11px] font-normal leading-tight",
                      isActive ? "text-white/80" : "text-zinc-500 dark:text-zinc-500",
                    )}
                  >
                    {s.short}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
        <p className="mt-4 px-1 text-xs text-zinc-500 dark:text-zinc-400">
          Need the full walkthrough?{" "}
          <Link href="/workspace-setup" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Workspace setup
          </Link>{" "}
          ·{" "}
          <Link href="/pipeline" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Workflow
          </Link>
        </p>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        {active === "overview" && (
          <Card className="overflow-hidden rounded-2xl border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-col gap-4 border-b border-zinc-100 bg-gradient-to-r from-slate-50/90 to-white sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Workspace</CardTitle>
                <CardDescription className="text-sm text-zinc-600 dark:text-zinc-400">
                  Active profile used for research and content{workspaceSetups.length > 1 ? ` · ${workspaceSetups.length} saved setups` : ""}.
                </CardDescription>
              </div>
              <Button asChild className="w-full shrink-0 rounded-xl bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                <Link href="/workspace-setup">Manage workspaces</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/35">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    <Building2 className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Company</p>
                    <p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{displayCompany}</p>
                    {displayWebsite ? (
                      <a
                        href={displayWebsite.startsWith("http") ? displayWebsite : `https://${displayWebsite}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {displayWebsite}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">No website on file</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/35">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    <Globe2 className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Primary region</p>
                    <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{displayRegion}</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">AI research and content follow this market.</p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/35 sm:col-span-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    <Sparkles className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Scenario & model</p>
                    <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      <span className="text-zinc-700 dark:text-zinc-300">Scenario:</span> {displayScenario}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                      <span className="text-zinc-500 dark:text-zinc-400">AI model:</span> {displayModel}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {active === "integrations" && (
          <Card className="rounded-2xl border-zinc-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Integrations</CardTitle>
              <CardDescription>Connect the accounts you publish to. Tokens are configured in the backend environment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/30">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">LinkedIn</p>
                  <p className="text-sm text-zinc-500">{linkedin.connected ? "Connected" : "Not connected"}</p>
                  {linkedin.connected && (
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {linkedin.accountName} · @{linkedin.accountHandle}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant={linkedin.connected ? "secondary" : "default"}
                  className="rounded-xl sm:w-40"
                  onClick={() =>
                    void connectLinkedin()
                      .then((ok) =>
                        push(
                          ok
                            ? "LinkedIn is connected and ready to publish."
                            : "LinkedIn is not connected. In backend/.env, set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN, then click Connect again (restart not required).",
                        ),
                      )
                      .catch((e: unknown) => push(e instanceof Error ? e.message : "Could not reach the server."))
                  }
                >
                  {linkedin.connected ? "Reconnect" : "Connect"}
                </Button>
              </div>
              <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/30">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">Meta (Facebook + Instagram)</p>
                  <p className="text-sm text-zinc-500">{meta.connected ? "Connected" : "Not connected"}</p>
                  {meta.connected && (
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {meta.accountName} · @{meta.accountHandle}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant={meta.connected ? "secondary" : "default"}
                  className="rounded-xl sm:w-40"
                  onClick={() =>
                    void connectMeta()
                      .then((ok) =>
                        push(
                          ok
                            ? "Meta (Facebook / Instagram) is connected and ready to publish."
                            : "Meta is not connected. In backend/.env, set a Page access token (META_PAGE_ACCESS_TOKEN or META_FACEBOOK_ACCESS_TOKEN) plus META_PAGE_ID and/or META_IG_BUSINESS_ACCOUNT_ID, then click Connect again.",
                        ),
                      )
                      .catch((e: unknown) => push(e instanceof Error ? e.message : "Could not reach the server."))
                  }
                >
                  {meta.connected ? "Reconnect" : "Connect"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {active === "security" && (
          <Card className="rounded-2xl border-zinc-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">API keys (simulated)</CardTitle>
              <CardDescription>How credentials are handled in this stack.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                <li>Store real tokens in <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">backend/.env</code>, never in the repo.</li>
                <li>Restart the API after changing env vars; the Next.js app proxies to your FastAPI host.</li>
                <li>In production, use HTTPS, restrict CORS, and rotate tokens if they are exposed.</li>
              </ul>
              <div className="space-y-2">
                <Label>Workspace secret</Label>
                <Input readOnly value="mcc_live_****************************9f2a" className="rounded-xl font-mono text-xs" />
              </div>
              <div className="space-y-2">
                <Label>Automation token</Label>
                <Input readOnly value="mcc_atok_****************************c71d" className="rounded-xl font-mono text-xs" />
              </div>
              <p className="text-xs text-zinc-500">Placeholder values for UI; wire your own key management for production.</p>
            </CardContent>
          </Card>
        )}

        {active === "preferences" && (
          <Card className="w-full max-w-2xl overflow-hidden rounded-2xl border-zinc-200/90 shadow-sm">
            <CardHeader className="border-b border-zinc-100 bg-gradient-to-r from-slate-50/90 to-white px-6 py-5 dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950 sm:px-8 sm:py-6">
              <CardTitle className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl dark:text-zinc-50">Posting preferences</CardTitle>
              <CardDescription className="mt-1.5 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
                Defaults for bulk actions and digests.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 p-6 sm:p-8">
              <div className="space-y-3">
                <div>
                  <Label className="text-base text-zinc-900 dark:text-zinc-100">Default platform</Label>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Used when a flow does not set a per-post network.</p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {(["linkedin", "instagram", "facebook"] as const).map((p) => {
                    const selected = prefs.defaultPlatform === p;
                    return (
                      <Button
                        key={p}
                        type="button"
                        size="default"
                        variant={selected ? "default" : "outline"}
                        className={cn("h-11 min-w-[6.5rem] rounded-full px-5 text-sm font-medium", selected && "shadow-sm")}
                        onClick={() => void savePreferences({ defaultPlatform: p }).then(() => push("Preference saved"))}
                      >
                        {platformLabel(p)}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

              <div className="space-y-4">
                <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/35 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">Quiet hours</p>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Avoid scheduling during off-hours (simulated).
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={prefs.quietHoursEnabled ? "default" : "outline"}
                    className="h-11 shrink-0 self-start rounded-full px-8 text-sm font-semibold sm:self-auto"
                    onClick={() => void savePreferences({ quietHoursEnabled: !prefs.quietHoursEnabled }).then(() => push("Updated"))}
                  >
                    {prefs.quietHoursEnabled ? "On" : "Off"}
                  </Button>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/35 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">Approval digest</p>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">How approval notifications are grouped.</p>
                  </div>
                  <div
                    className="inline-flex shrink-0 self-stretch rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 sm:self-auto"
                    role="group"
                    aria-label="Approval digest frequency"
                  >
                    {(["daily", "instant"] as const).map((mode) => {
                      const activeDigest = prefs.approvalDigest === mode;
                      return (
                        <Button
                          key={mode}
                          type="button"
                          variant={activeDigest ? "default" : "ghost"}
                          className={cn(
                            "h-9 min-w-[5.5rem] rounded-xl px-4 text-sm font-medium",
                            !activeDigest && "text-zinc-600 hover:bg-zinc-100/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80",
                          )}
                          onClick={() => {
                            if (prefs.approvalDigest === mode) return;
                            void savePreferences({ approvalDigest: mode }).then(() => push("Updated"));
                          }}
                        >
                          {mode === "daily" ? "Daily" : "Instant"}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={<Skeleton className="h-[min(640px,85dvh)] w-full min-h-[16rem] rounded-2xl" aria-hidden />}
    >
      <SettingsContent />
    </Suspense>
  );
}
