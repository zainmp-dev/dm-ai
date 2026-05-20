"use client";

import { Suspense, startTransition, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Facebook,
  Instagram,
  KeyRound,
  LayoutGrid,
  Link2,
  Linkedin,
  Mic,
  SlidersHorizontal,
  UserCircle2,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { clearAuthSession } from "@/lib/auth";
import { apiDeleteAccount, apiErrorMessage } from "@/lib/api";
import { platformLabel } from "@/lib/platform";
import { setOAuthPostConnectReturn } from "@/lib/first-login-wizard";
import {
  socialConnectAlreadyLine,
  socialConnectOpeningLine,
  socialConnectProblemLine,
} from "@/lib/social-connect-toast";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";
import { useAgentsFlow } from "@/components/agents-flow-provider";
import { WorkspaceSetupPanel } from "@/components/workspace/workspace-setup-panel";
import Link from "next/link";

const SECTIONS = [
  { id: "overview" as const, label: "Overview", short: "At a glance", icon: LayoutGrid },
  { id: "workspace" as const, label: "Workspace", short: "Brand & AI", icon: Building2 },
  { id: "integrations" as const, label: "Integrations", short: "Social", icon: Link2 },
  { id: "assistant" as const, label: "Voice & AI flow", short: "Mic", icon: Mic },
  { id: "security" as const, label: "API & security", short: "API", icon: KeyRound },
  { id: "preferences" as const, label: "Preferences", short: "Defaults", icon: SlidersHorizontal },
  { id: "account" as const, label: "Account", short: "Close", icon: UserX },
];

const SECTION_PARAM_IDS: (typeof SECTIONS)[number]["id"][] = [
  "overview",
  "workspace",
  "integrations",
  "assistant",
  "security",
  "preferences",
  "account",
];

function isSectionId(value: string | null): value is (typeof SECTIONS)[number]["id"] {
  return Boolean(value && SECTION_PARAM_IDS.includes(value as (typeof SECTIONS)[number]["id"]));
}

function linkedinProfileLink(accountUrl: string | null | undefined, accountHandle: string | null | undefined): string | null {
  const direct = typeof accountUrl === "string" ? accountUrl.trim() : "";
  if (direct) return direct;
  const handle = typeof accountHandle === "string" ? accountHandle.trim() : "";
  if (!handle || handle.startsWith("pending-")) return null;
  // Use /in/{slug} only for likely vanity slugs; LinkedIn account ids are not valid public profile paths.
  if (/^[a-z0-9-]{3,100}$/.test(handle) && /[a-z]/.test(handle)) {
    return `https://www.linkedin.com/in/${encodeURIComponent(handle)}/`;
  }
  // Safe fallback: LinkedIn resolves this to the signed-in member profile context.
  return "https://www.linkedin.com/me/";
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAgentsFlow } = useAgentsFlow();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const connectLinkedin = useWorkspaceStore((s) => s.connectLinkedin);
  const connectMeta = useWorkspaceStore((s) => s.connectMeta);
  const savePreferences = useWorkspaceStore((s) => s.savePreferences);
  const resetAfterAccountDeletion = useWorkspaceStore((s) => s.resetAfterAccountDeletion);
  const { push } = useToast();
  const [active, setActive] = useState<(typeof SECTIONS)[number]["id"]>("overview");
  const [linkedinConnecting, setLinkedinConnecting] = useState(false);
  const [metaConnecting, setMetaConnecting] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);

  const goToSection = (id: (typeof SECTIONS)[number]["id"]) => {
    startTransition(() => setActive(id));
    router.replace(`/settings?section=${id}`, { scroll: false });
  };

  useEffect(() => {
    const section = searchParams.get("section");
    if (isSectionId(section)) {
      startTransition(() => setActive(section));
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
        push("You’re connected to LinkedIn. You can publish approved posts from your workflow.", { durationMs: oauthToastMs });
      } else if (toast === "linkedin_connected_pending") {
        push("LinkedIn is connected. Your profile details may take a little longer to appear — that’s normal.", {
          durationMs: oauthToastMs,
        });
      } else if (toast === "linkedin_failed") {
        push(
          detail ? socialConnectProblemLine("LinkedIn", new Error(detail)) : "We couldn’t connect LinkedIn. Tap Connect and try again.",
          {
            durationMs: oauthToastMs,
          },
        );
      } else if (toast === "meta_connected") {
        push("Facebook and Instagram are connected. You’re ready to publish from your workflow.", { durationMs: oauthToastMs });
      } else if (toast === "meta_failed") {
        push(
          detail
            ? socialConnectProblemLine("Meta", new Error(detail))
            : "We couldn’t connect Facebook or Instagram. Tap Connect and try again.",
          {
            durationMs: oauthToastMs,
          },
        );
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
  const linkedinOpenUrl = linkedinProfileLink(linkedin.accountUrl, linkedin.accountHandle);
  const prefs = workspace.preferences;

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
                onClick={() => goToSection(s.id)}
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
          Multiple brands? Open the{" "}
          <button
            type="button"
            onClick={() => goToSection("workspace")}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Workspace
          </button>{" "}
          tab ·{" "}
          <Link href="/pipeline" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Workflow
          </Link>
        </p>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        {active === "overview" && (
          <div className="space-y-6">
            <Card className="overflow-hidden rounded-2xl border-zinc-200/90 shadow-sm dark:border-zinc-800">
              <CardHeader className="border-b border-zinc-100 bg-gradient-to-r from-slate-50/90 to-white px-6 py-5 dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950 sm:px-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 shadow-sm dark:bg-blue-950/70 dark:text-blue-300">
                      <UserCircle2 className="size-6" aria-hidden />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Signed in</CardTitle>
                      <CardDescription className="text-sm text-zinc-600 dark:text-zinc-400">
                        {workspace.profile.name ? (
                          <span className="block font-medium text-zinc-800 dark:text-zinc-200">{workspace.profile.name}</span>
                        ) : null}
                        <span className="block truncate">{workspace.profile.email}</span>
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0 rounded-xl border-zinc-200 font-medium dark:border-zinc-700"
                    onClick={() => goToSection("account")}
                  >
                    Account &amp; security
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6 sm:p-8">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Jump to a section</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Open the area you need without hunting the sidebar.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      { id: "workspace" as const, title: "Workspace", blurb: "Brand, market, AI model, saved setups", icon: Building2 },
                      { id: "integrations" as const, title: "Integrations", blurb: "LinkedIn & Meta publishing", icon: Link2 },
                      { id: "assistant" as const, title: "Voice & AI flow", blurb: "Hands-free navigation & agents", icon: Mic },
                      { id: "preferences" as const, title: "Preferences", blurb: "Posting defaults & digests", icon: SlidersHorizontal },
                    ] satisfies { id: (typeof SECTIONS)[number]["id"]; title: string; blurb: string; icon: typeof Building2 }[]
                  ).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => goToSection(item.id)}
                        className="group flex w-full items-start gap-3 rounded-2xl border border-zinc-200/90 bg-white p-4 text-left shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:border-blue-800/60 dark:hover:bg-blue-950/20"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 group-hover:bg-white group-hover:text-blue-700 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:bg-zinc-900">
                          <Icon className="size-5" aria-hidden />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-50">{item.title}</span>
                            <ChevronRight className="size-4 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                          </span>
                          <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">{item.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {active === "workspace" && <WorkspaceSetupPanel />}

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
                        {linkedinOpenUrl ? (
                          <a
                            href={linkedinOpenUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-blue-700 underline-offset-2 hover:text-blue-800 hover:underline dark:text-sky-300 dark:hover:text-sky-200"
                          >
                            Open LinkedIn page
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
                    setOAuthPostConnectReturn("/settings?section=integrations");
                    void connectLinkedin("_self")
                      .then((r) => {
                        if (r === "redirect") {
                          push(socialConnectOpeningLine("LinkedIn"), { durationMs: 7000 });
                        } else {
                          push(socialConnectAlreadyLine("LinkedIn"), { durationMs: 6000 });
                        }
                      })
                      .catch((e: unknown) => push(socialConnectProblemLine("LinkedIn", e), { durationMs: 9000 }))
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
                      <div className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <p>
                          Connects Facebook <strong className="font-medium text-zinc-800 dark:text-zinc-200">Page</strong> posts and Instagram{" "}
                          <strong className="font-medium text-zinc-800 dark:text-zinc-200">Business/Creator</strong> (linked to that Page).
                          Personal profiles alone cannot publish through the Meta API—we cannot auto-create a business set-up for you; create a Page in Meta
                          Business Suite and link IG there first.
                        </p>
                        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
                          OAuth completes in seconds if your Meta app (<code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">META_APP_ID</code> /
                          secret) matches the dashboard redirect URL. If connect fails with &quot;no Pages&quot;, assign yourself Admin on a Page, then reconnect.
                        </p>
                      </div>
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
                    setOAuthPostConnectReturn("/settings?section=integrations");
                    void connectMeta("_self")
                      .then((r) => {
                        if (r === "redirect") {
                          push(socialConnectOpeningLine("Meta"), { durationMs: 7000 });
                        } else {
                          push(socialConnectAlreadyLine("Meta"), { durationMs: 6000 });
                        }
                      })
                      .catch((e: unknown) => push(socialConnectProblemLine("Meta", e), { durationMs: 9000 }))
                      .finally(() => setMetaConnecting(false));
                  }}
                >
                  {metaConnecting ? "Connecting…" : meta.connected ? "Reconnect" : "Connect"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {active === "assistant" && (
          <Card className="overflow-hidden rounded-2xl border-zinc-200 shadow-sm dark:border-zinc-800">
            <CardHeader className="border-b border-zinc-100 bg-gradient-to-r from-slate-50/90 to-white dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950">
              <CardTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Voice commands & AI agents
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Use hands-free navigation where your browser supports it, and see how server-side agents support research runs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/60 p-5 dark:border-zinc-800 dark:bg-zinc-900/35">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Voice navigation</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                  In the workspace, use the floating microphone (bottom-right). Open the panel for “Read answers aloud” and the spoken
                  accent used for both listening and playback. Use the toolbar—or say stop, skip, clear, repeat—for control. Short
                  phrases work best: “Open dashboard,” “Approval queue,” “Publishing.” Audio goes to your browser’s speech service for
                  transcription, not FlowPilot’s servers. Chrome and Edge usually work best; allow mic access when prompted.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Open the same diagram linked from the voice panel: your workflow steps and the backend research pipeline.
                </p>
                <Button
                  type="button"
                  className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => openAgentsFlow()}
                >
                  View AI agents & workflow
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

        {active === "account" && (
          <Card className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200/90 shadow-sm dark:border-zinc-800">
            <CardHeader className="border-b border-zinc-100 bg-gradient-to-br from-zinc-50/95 to-white px-6 py-6 dark:border-zinc-800 dark:from-zinc-900/70 dark:to-zinc-950 sm:px-8 sm:py-7">
              <div className="flex items-start gap-4">
                <div
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                  aria-hidden
                >
                  <UserX className="size-6" />
                </div>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Close account</CardTitle>
                  <CardDescription className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Deactivate your login and remove workspace data. Your user record is kept with a closed flag; you can sign up again with the same email.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-6 sm:p-8">
              <ul className="space-y-2.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                <li className="flex gap-2.5">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-red-500/80" aria-hidden />
                  <span>Workspace content, drafts, and analytics in FlowPilot are deleted; social publish tokens are cleared.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-red-500/80" aria-hidden />
                  <span>Your login is deactivated (account row kept with a closed timestamp); Google or Facebook links on the profile are cleared.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-red-500/80" aria-hidden />
                  <span>You are signed out right away after you confirm.</span>
                </li>
              </ul>
              <Button
                type="button"
                variant="destructive"
                className="h-11 rounded-xl px-6 font-semibold shadow-sm"
                onClick={() => setDeleteAccountOpen(true)}
              >
                Close my account
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={deleteAccountOpen} onOpenChange={(open) => !deleteAccountBusy && setDeleteAccountOpen(open)}>
        <DialogContent
          overlayClassName="bg-zinc-950/80 backdrop-blur-[6px]"
          className="max-h-[calc(100dvh-1rem)] w-[min(100vw-1.25rem,24rem)] max-w-[min(100vw-1.25rem,28rem)] gap-0 overflow-y-auto border-0 bg-transparent p-3 shadow-none sm:max-w-md sm:p-5"
          onPointerDownOutside={(e) => deleteAccountBusy && e.preventDefault()}
          onEscapeKeyDown={(e) => deleteAccountBusy && e.preventDefault()}
        >
          <div className="relative rounded-[1.25rem] border border-zinc-200/90 bg-white p-6 pt-10 shadow-2xl ring-1 ring-black/[0.04] dark:border-zinc-700 dark:bg-zinc-900 dark:ring-white/[0.06] sm:p-8 sm:pt-11">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Close your account?
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-4 text-left text-sm text-zinc-600 dark:text-zinc-300">
                  <p>
                    Workspace data and integrations for{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{workspace.profile.email}</span> will be removed. Your account will
                    be deactivated (soft delete); you cannot log in until you sign up again.
                  </p>
                  <p className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3.5 py-3 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                    Export anything you need first. This stops access immediately after you confirm.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-8 flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button
                type="button"
                variant="destructive"
                className="h-11 w-full rounded-xl font-semibold"
                disabled={deleteAccountBusy}
                onClick={() => {
                  setDeleteAccountBusy(true);
                  void apiDeleteAccount()
                    .then(() => {
                      resetAfterAccountDeletion();
                      clearAuthSession();
                      push("Your account has been closed.");
                      setDeleteAccountOpen(false);
                      router.replace("/login");
                    })
                    .catch((err: unknown) => {
                      push(apiErrorMessage(err));
                    })
                    .finally(() => setDeleteAccountBusy(false));
                }}
              >
                {deleteAccountBusy ? "Closing…" : "Yes, close my account"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl font-medium"
                disabled={deleteAccountBusy}
                onClick={() => setDeleteAccountOpen(false)}
              >
                Cancel, keep my account
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
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
