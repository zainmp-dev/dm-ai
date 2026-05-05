"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Globe2,
  Instagram,
  KeyRound,
  LayoutGrid,
  Link2,
  Linkedin,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { labelForAiModel } from "@/lib/ai-models";
import { platformLabel } from "@/lib/platform";
import { primaryRegionLabel } from "@/lib/primary-region";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceSetups = useWorkspaceStore((s) => s.workspaceSetups);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const connectLinkedin = useWorkspaceStore((s) => s.connectLinkedin);
  const connectMeta = useWorkspaceStore((s) => s.connectMeta);
  const savePreferences = useWorkspaceStore((s) => s.savePreferences);
  const { push } = useToast();
  const [active, setActive] = useState<(typeof SECTIONS)[number]["id"]>("overview");
  const [linkedinConnecting, setLinkedinConnecting] = useState(false);
  const [metaConnecting, setMetaConnecting] = useState(false);

  function formatConnectError(platform: "LinkedIn" | "Meta", error: unknown): string {
    const raw = error instanceof Error ? error.message : "Could not reach the server.";
    if (/\b429\b|rate[\s-]?limit/i.test(raw)) {
      return `${platform} is rate-limited right now. Wait 2-5 minutes, then try again once.`;
    }
    return raw;
  }

  useEffect(() => {
    const section = searchParams.get("section");
    if (isSectionId(section)) {
      setActive(section);
    }
  }, [searchParams]);

  useEffect(() => {
    const toast = searchParams.get("toast");
    if (!toast) return;

    const fullQs = searchParams.toString();
    const dedupeKey = `fp_oauth_toast_ts:${fullQs}`;
    const now = Date.now();
    let showToast = true;
    if (typeof window !== "undefined") {
      const prev = sessionStorage.getItem(dedupeKey);
      if (prev) {
        const t = Number(prev);
        if (!Number.isNaN(t) && now - t < 5000) {
          showToast = false;
        }
      }
      sessionStorage.setItem(dedupeKey, String(now));
    }

    const detailRaw = searchParams.get("toast_detail");
    let detail = "";
    if (detailRaw) {
      try {
        detail = decodeURIComponent(detailRaw);
      } catch {
        detail = detailRaw;
      }
    }

    const oauthToastMs = 10_000;
    if (showToast) {
      if (toast === "linkedin_connected") {
        push("LinkedIn connected. You can publish to LinkedIn from the pipeline.", { durationMs: oauthToastMs });
      } else if (toast === "linkedin_connected_pending") {
        push("LinkedIn connected. Profile details are syncing due to temporary LinkedIn throttling.", {
          durationMs: oauthToastMs,
        });
      } else if (toast === "linkedin_failed") {
        push(detail ? `LinkedIn connection failed: ${detail}` : "LinkedIn connection failed. Try Connect again.", {
          durationMs: oauthToastMs,
        });
      } else if (toast === "meta_connected") {
        push("Meta connected. Facebook and Instagram publishing is ready.", { durationMs: oauthToastMs });
      } else if (toast === "meta_failed") {
        push(detail ? `Meta connection failed: ${detail}` : "Meta connection failed. Try Connect again.", {
          durationMs: oauthToastMs,
        });
      }
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete("toast");
    next.delete("toast_detail");
    const rest = next.toString();
    const target = rest ? `/settings?${rest}` : "/settings";
    const delayMs = showToast ? 480 : 0;
    const t = window.setTimeout(() => {
      router.replace(target);
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [searchParams, router, push]);

  if (shellPending) {
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
          <Card className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50">
            <CardHeader className="border-b border-zinc-100 bg-gradient-to-r from-zinc-50/90 to-white px-6 py-5 dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950/80">
              <CardTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Integrations</CardTitle>
              <CardDescription className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Connect the accounts this workspace publishes to. You&apos;ll sign in on each network and approve access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/60 px-5 py-4 dark:border-zinc-700/80 dark:bg-zinc-900/35">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Before you connect</p>
                <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  <li className="flex gap-2.5">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-blue-500" aria-hidden />
                    <span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">LinkedIn</span> — use the profile or company presence
                      that should own what you publish.
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                    <span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">Meta (Facebook &amp; Instagram)</span> — you need a{" "}
                      <strong className="text-zinc-900 dark:text-zinc-50">Facebook Business Page</strong> (not a personal profile on its own).
                      For Instagram, connect an <strong className="text-zinc-900 dark:text-zinc-50">Instagram Business</strong> profile linked to
                      that Page in Meta Business Suite, under your organization&apos;s <strong className="text-zinc-900 dark:text-zinc-50">Meta Business</strong>{" "}
                      account.
                    </span>
                  </li>
                </ul>
                <p className="mt-3 border-t border-zinc-200/80 pt-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  When you come back to FlowPilot, a short confirmation appears in the corner of the screen so you know it worked—or if anything
                  still needs attention.
                </p>
                <div className="mt-4 border-t border-zinc-200/80 pt-4 dark:border-zinc-700">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Setup (opens in a new tab)</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <a
                      href="https://www.linkedin.com/developers/apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      aria-label="LinkedIn Developer Portal, opens in a new tab"
                    >
                      LinkedIn Developer Portal
                      <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
                    </a>
                    <span className="hidden text-zinc-300 sm:inline dark:text-zinc-600" aria-hidden>
                      ·
                    </span>
                    <a
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 underline-offset-2 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                      aria-label="Meta for Developers, opens in a new tab"
                    >
                      Meta for Developers
                      <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
                    </a>
                    <span className="hidden text-zinc-300 sm:inline dark:text-zinc-600" aria-hidden>
                      ·
                    </span>
                    <a
                      href="https://business.facebook.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 underline-offset-2 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                      aria-label="Meta Business Suite, opens in a new tab"
                    >
                      Meta Business Suite
                      <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
                    </a>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "flex flex-col gap-5 rounded-2xl border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between",
                  linkedin.connected
                    ? "border-emerald-200/90 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/25"
                    : "border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900/20",
                )}
              >
                <div className="flex min-w-0 flex-1 gap-4">
                  <div
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-xl shadow-sm",
                      linkedin.connected
                        ? "bg-emerald-100 text-[#0A66C2] ring-1 ring-emerald-200/80 dark:bg-emerald-900/40 dark:text-sky-300 dark:ring-emerald-800/60"
                        : "bg-blue-50 text-[#0A66C2] ring-1 ring-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900/40",
                    )}
                  >
                    <Linkedin className="size-6" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">LinkedIn</p>
                      {linkedin.connected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200">
                          <CheckCircle2 className="size-3.5" aria-hidden />
                          Connected
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          Not connected
                        </span>
                      )}
                    </div>
                    {linkedin.connected ? (
                      <div className="mt-2 space-y-1.5 text-sm text-emerald-900/90 dark:text-emerald-100/90">
                        <p>
                          {linkedin.accountName}
                          {linkedin.accountHandle ? ` · @${linkedin.accountHandle}` : null}
                        </p>
                        {linkedin.accountUrl ? (
                          <a
                            href={linkedin.accountUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-blue-700 underline-offset-2 hover:text-blue-800 hover:underline dark:text-sky-300 dark:hover:text-sky-200"
                          >
                            Open LinkedIn profile
                            <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Publish approved posts to your company or member profile.</p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-10 shrink-0 rounded-xl px-5 font-medium sm:min-w-[9.5rem]",
                    linkedin.connected
                      ? "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/30"
                      : "border-blue-200 bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:border-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500",
                  )}
                  disabled={linkedinConnecting}
                  onClick={() => {
                    if (linkedinConnecting) return;
                    setLinkedinConnecting(true);
                    void connectLinkedin("_self")
                      .then((ok) =>
                        push(ok ? "Redirecting to LinkedIn…" : "LinkedIn connect is unavailable right now.", { durationMs: 6000 }),
                      )
                      .catch((e: unknown) => push(formatConnectError("LinkedIn", e), { durationMs: 9000 }))
                      .finally(() => setLinkedinConnecting(false));
                  }}
                >
                  {linkedinConnecting ? "Connecting…" : linkedin.connected ? "Reconnect" : "Connect"}
                </Button>
              </div>

              <div
                className={cn(
                  "flex flex-col gap-5 rounded-2xl border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between",
                  meta.connected
                    ? "border-emerald-200/90 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/25"
                    : "border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900/20",
                )}
              >
                <div className="flex min-w-0 flex-1 gap-4">
                  <div
                    className={cn(
                      "flex size-12 shrink-0 flex-row items-center justify-center gap-0.5 rounded-xl shadow-sm",
                      meta.connected
                        ? "bg-emerald-100 text-blue-700 ring-1 ring-emerald-200/80 dark:bg-emerald-900/40 dark:text-blue-300 dark:ring-emerald-800/60"
                        : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900/40",
                    )}
                  >
                    <Facebook className="size-5" aria-hidden />
                    <Instagram className="size-4 shrink-0 opacity-90" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-50">Meta</p>
                      <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">Facebook · Instagram</span>
                      {meta.connected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200">
                          <CheckCircle2 className="size-3.5" aria-hidden />
                          Connected
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          Not connected
                        </span>
                      )}
                    </div>
                    {meta.connected ? (
                      <div className="mt-2 space-y-1.5 text-sm text-emerald-900/90 dark:text-emerald-100/90">
                        <p>
                          {meta.accountName}
                          {meta.accountHandle ? ` · Page ID ${meta.accountHandle}` : null}
                        </p>
                        {meta.accountUrl ? (
                          <a
                            href={meta.accountUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-blue-700 underline-offset-2 hover:text-blue-800 hover:underline dark:text-sky-300 dark:hover:text-sky-200"
                          >
                            Open Facebook Page
                            <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        Business Page plus Instagram Business, linked in Meta Business Suite.
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-10 shrink-0 rounded-xl px-5 font-medium sm:min-w-[9.5rem]",
                    meta.connected
                      ? "border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/30"
                      : "border-blue-200 bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:border-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500",
                  )}
                  disabled={metaConnecting}
                  onClick={() => {
                    if (metaConnecting) return;
                    setMetaConnecting(true);
                    void connectMeta("_self")
                      .then((ok) =>
                        push(ok ? "Redirecting to Meta…" : "Meta connect is unavailable right now.", { durationMs: 6000 }),
                      )
                      .catch((e: unknown) => push(formatConnectError("Meta", e), { durationMs: 9000 }))
                      .finally(() => setMetaConnecting(false));
                  }}
                >
                  {metaConnecting ? "Connecting…" : meta.connected ? "Reconnect" : "Connect"}
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
