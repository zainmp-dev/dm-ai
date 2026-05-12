"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Facebook, Instagram, Linkedin, Loader2, Sparkles, Volume2, VolumeX } from "lucide-react";
import { WorkspaceSetupFields, CUSTOM_SCENARIO_VALUE } from "@/components/onboarding/workspace-setup-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  cancelAssistantSpeech,
  getVoiceAccent,
  isAssistantVoiceEnabled,
  prefetchAssistantVoices,
  setAssistantVoiceEnabled,
  setVoiceAccent,
  speakAssistantLine,
  type VoiceAccentPreference,
} from "@/lib/assistant-voice";
import {
  clearFirstLoginWizardKeys,
  readFirstWizardStep,
  setFirstWizardSession,
  setOAuthPostConnectReturn,
} from "@/lib/first-login-wizard";
import { apiErrorMessage } from "@/lib/api";
import { normalizePrimaryRegionCode, type PrimaryRegionCode } from "@/lib/primary-region";
import type { WorkspaceScenario } from "@/lib/types";
import { validateWorkspaceWebsiteUrl } from "@/lib/workspace-website-url";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";

type Step = "workspace" | "social" | "ready";

function WizardStepBadge({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        complete && !active && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
        active && "bg-blue-600 text-white shadow-sm dark:bg-blue-600",
        !active && !complete && "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
      )}
    >
      {complete && !active ? "✓ " : null}
      {label}
    </span>
  );
}

function FirstRunWorkspaceWizardContent({ push }: { push: (message: string, opts?: { kind?: "error" | "success"; durationMs?: number }) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const selectedAiModel = useWorkspaceStore((s) => s.selectedAiModel);
  const setupWorkspace = useWorkspaceStore((s) => s.setupWorkspace);
  const connectLinkedin = useWorkspaceStore((s) => s.connectLinkedin);
  const connectMeta = useWorkspaceStore((s) => s.connectMeta);
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace);
  const setFirstRunOnboardingFocused = useWorkspaceStore((s) => s.setFirstRunOnboardingFocused);

  const [step, setStep] = useState<Step>("workspace");
  const [hydratedStep, setHydratedStep] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [accentPref, setAccentPref] = useState<VoiceAccentPreference>("auto");
  const [saving, setSaving] = useState(false);
  const [linkedinBusy, setLinkedinBusy] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<WorkspaceScenario>("it-services");
  const [customScenario, setCustomScenario] = useState("");
  const [primaryRegions, setPrimaryRegions] = useState<PrimaryRegionCode[]>([normalizePrimaryRegionCode(undefined)]);
  const [customPrimaryMarket, setCustomPrimaryMarket] = useState("");

  const welcomeRef = useRef(false);
  const socialWelcomeRef = useRef(false);

  useLayoutEffect(() => {
    setFirstRunOnboardingFocused(true);
    return () => setFirstRunOnboardingFocused(false);
  }, [setFirstRunOnboardingFocused]);

  useEffect(() => {
    setVoiceOn(isAssistantVoiceEnabled());
    setAccentPref(getVoiceAccent());
    prefetchAssistantVoices();
  }, []);

  useEffect(() => {
    const stored = readFirstWizardStep();
    if (stored) setStep(stored);
    setFirstWizardSession(true, stored ?? "workspace");
    setHydratedStep(true);
  }, []);

  useEffect(() => {
    if (!hydratedStep || step !== "workspace" || welcomeRef.current) return;
    welcomeRef.current = true;
    speakAssistantLine(
      "Welcome to FlowPilot. This setup runs once for new accounts. I will give short spoken updates. Adjust accent or mute below.",
    );
  }, [hydratedStep, step]);

  useEffect(() => {
    if (!hydratedStep || step !== "social" || socialWelcomeRef.current) return;
    socialWelcomeRef.current = true;
    speakAssistantLine(
      "Workspace details are saved. Connect LinkedIn or Meta here if you like. You can also skip and link accounts later in Settings.",
    );
  }, [hydratedStep, step]);

  useEffect(() => {
    if (!hydratedStep || step !== "ready") return;
    speakAssistantLine("Setup is complete. Tap Enter workflow when you are ready.");
  }, [hydratedStep, step]);

  useEffect(() => {
    return () => {
      cancelAssistantSpeech();
    };
  }, []);

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
        const short = detail && detail.length <= 100 ? detail.replace(/\s+/g, " ").trim() : "";
        push(short ? `LinkedIn: ${short}` : "LinkedIn didn’t connect. Try again.", {
          kind: "error",
          durationMs: oauthToastMs,
        });
      } else if (toast === "meta_connected") {
        push("Meta connected. Facebook and Instagram publishing is ready.", { durationMs: oauthToastMs });
      } else if (toast === "meta_failed") {
        const short = detail && detail.length <= 100 ? detail.replace(/\s+/g, " ").trim() : "";
        push(short ? `Meta: ${short}` : "Meta didn’t connect. Try again.", {
          kind: "error",
          durationMs: oauthToastMs,
        });
      }
    }

    void refreshWorkspace({ soft: true });

    const next = new URLSearchParams(searchParams.toString());
    next.delete("toast");
    next.delete("toast_detail");
    const rest = next.toString();
    const target = rest ? `/workspace-setup?${rest}` : "/workspace-setup";
    const delayMs = showToast ? 480 : 0;
    const t = window.setTimeout(() => {
      router.replace(target);
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [searchParams, router, push, refreshWorkspace]);

  const selectedScenario = scenario === CUSTOM_SCENARIO_VALUE ? customScenario.trim() : scenario;

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

  const togglePrimaryRegion = (value: PrimaryRegionCode) => {
    setPrimaryRegions((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((v) => v !== value);
        return next.length ? next : [normalizePrimaryRegionCode(undefined)];
      }
      return [...prev, value];
    });
  };

  const selectScenario = (value: WorkspaceScenario) => {
    setScenario(value);
    if (value !== CUSTOM_SCENARIO_VALUE) {
      setCustomScenario("");
    }
  };

  const toggleVoice = () => {
    const next = !isAssistantVoiceEnabled();
    setAssistantVoiceEnabled(next);
    setVoiceOn(next);
    if (!next) cancelAssistantSpeech();
    else {
      speakAssistantLine("Voice cues are on. Spoken accent follows your selection below.");
    }
  };

  const onAccentChange = (value: VoiceAccentPreference) => {
    setVoiceAccent(value);
    setAccentPref(value);
    if (!isAssistantVoiceEnabled()) return;
    cancelAssistantSpeech();
    speakAssistantLine(
      value === "in"
        ? "Accent set to Indian English."
        : value === "us"
          ? "Accent set to U.S. English."
          : value === "uk"
            ? "Accent set to UK English."
            : "Accent set to automatic. I will use the clearest English voice available on this device.",
    );
  };

  const handleWebsiteBlur = useCallback(() => {
    const t = website.trim();
    if (!t) {
      setWebsiteError(null);
      return;
    }
    const r = validateWorkspaceWebsiteUrl(website);
    setWebsiteError(r.ok ? null : r.message);
  }, [website]);

  const websiteValid = validateWorkspaceWebsiteUrl(website).ok;

  const handleSaveWorkspace = useCallback(() => {
    if (!workspace || !companyName.trim() || !selectedScenario) return;
    const w = validateWorkspaceWebsiteUrl(website);
    if (!w.ok) {
      setWebsiteError(w.message);
      return;
    }
    setSaving(true);
    speakAssistantLine(
      "I am creating your AI marketing agent. Please stay on this screen until the loading spinner disappears.",
    );
    void setupWorkspace({
      companyName: companyName.trim(),
      website: w.normalized,
      scenario: selectedScenario,
      primaryRegion: effectivePrimaryRegion,
      workspaceOwnerName: workspace.profile.name,
      workspaceOwnerEmail: workspace.profile.email,
      aiModel: selectedAiModel,
      competitors: [],
    })
      .then(() => {
        push("Saved. Continue to social connections, or skip and add them later in Settings.");
        setFirstWizardSession(true, "social");
        setStep("social");
        speakAssistantLine("Agent is ready. Next, you can connect social accounts.");
      })
      .catch((e: unknown) => {
        push(apiErrorMessage(e), { kind: "error", durationMs: 7000 });
      })
      .finally(() => setSaving(false));
  }, [
    workspace,
    companyName,
    website,
    selectedScenario,
    effectivePrimaryRegion,
    selectedAiModel,
    setupWorkspace,
    push,
  ]);

  const beginLinkedin = async () => {
    setLinkedinBusy(true);
    setOAuthPostConnectReturn("/workspace-setup");
    try {
      await connectLinkedin("_self");
    } catch (e: unknown) {
      const raw = apiErrorMessage(e);
      push(/\b429\b|rate[\s-]?limit/i.test(raw) ? "LinkedIn is busy. Try again shortly." : raw, {
        kind: "error",
      });
    } finally {
      setLinkedinBusy(false);
    }
  };

  const beginMeta = async () => {
    setMetaBusy(true);
    setOAuthPostConnectReturn("/workspace-setup");
    try {
      await connectMeta("_self");
    } catch (e: unknown) {
      const raw = apiErrorMessage(e);
      push(/\b429\b|rate[\s-]?limit/i.test(raw) ? "Meta is busy. Try again shortly." : raw, {
        kind: "error",
      });
    } finally {
      setMetaBusy(false);
    }
  };

  const finishOnboarding = () => {
    cancelAssistantSpeech();
    clearFirstLoginWizardKeys();
    push("Welcome to your workflow. Run Strategy and Generate when you are ready.");
    router.replace("/pipeline");
  };

  if (!workspace) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const li = workspace.integrations.linkedin.connected;
  const meta = workspace.integrations.meta.connected;

  return (
    <div className="mx-auto w-full max-w-2xl px-0 sm:px-2">
      <div className="mb-5 space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white shadow-md">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Set up your workspace</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Add your company and site, then connect social accounts if you want — you can skip and do that later in Settings.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200/80 bg-white/80 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/60 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <Label htmlFor="fp-voice-accent" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Spoken prompts (optional)
            </Label>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-500">
              Short browser voice cues. Adjust accent or mute.
            </p>
            <select
              id="fp-voice-accent"
              value={accentPref}
              onChange={(e) => onAccentChange(e.target.value as VoiceAccentPreference)}
              className="mt-2 h-9 w-full max-w-md rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="auto">Auto — Indian English first if available</option>
              <option value="in">Indian English</option>
              <option value="us">U.S. English</option>
              <option value="uk">UK English</option>
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-xl border-zinc-200 dark:border-zinc-700"
            onClick={toggleVoice}
            aria-pressed={voiceOn}
          >
            {voiceOn ? <Volume2 className="mr-1.5 size-4" /> : <VolumeX className="mr-1.5 size-4" />}
            {voiceOn ? "Sound on" : "Mute"}
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        <WizardStepBadge active={step === "workspace"} complete={step !== "workspace"} label="1 · Workspace" />
        <WizardStepBadge active={step === "social"} complete={step === "ready"} label="2 · Social" />
        <WizardStepBadge active={step === "ready"} complete={false} label="3 · Launch" />
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 opacity-90" />

        {step === "workspace" && (
          <div className="space-y-6 p-5 sm:p-7">
            <WorkspaceSetupFields
              idPrefix="first-"
              companyName={companyName}
              setCompanyName={setCompanyName}
              website={website}
              setWebsite={(v) => {
                setWebsite(v);
                setWebsiteError(null);
              }}
              websiteMode="required"
              websiteError={websiteError}
              websiteOnBlur={handleWebsiteBlur}
              scenario={scenario}
              selectScenario={selectScenario}
              customScenario={customScenario}
              setCustomScenario={setCustomScenario}
              primaryRegions={primaryRegions}
              togglePrimaryRegion={togglePrimaryRegion}
              customPrimaryMarket={customPrimaryMarket}
              setCustomPrimaryMarket={setCustomPrimaryMarket}
            />
            <div className="flex justify-end border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <Button
                type="button"
                disabled={saving || !companyName.trim() || !selectedScenario || !websiteValid}
                onClick={handleSaveWorkspace}
                className="w-full rounded-xl bg-blue-600 font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
                    Creating your agent…
                  </>
                ) : (
                  "Save & continue"
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "social" && (
          <div className="space-y-5 p-5 sm:p-7">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Connect publishing</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                OAuth opens in this window — you will return here automatically when authorization completes.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <div className="flex items-center gap-2">
                  <Linkedin className="size-5 text-[#0A66C2]" />
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">LinkedIn</span>
                  {li ? (
                    <span className="ml-auto text-xs font-medium text-emerald-600 dark:text-emerald-400">Connected</span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Professional posts and company updates.</p>
                <Button
                  type="button"
                  variant={li ? "outline" : "default"}
                  className="mt-4 w-full rounded-xl"
                  disabled={linkedinBusy || li}
                  onClick={() => void beginLinkedin()}
                >
                  {linkedinBusy ? <Loader2 className="size-4 animate-spin" /> : li ? "Connected" : "Connect LinkedIn"}
                </Button>
              </div>

              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <Facebook className="size-4 text-[#1877F2]" />
                    <Instagram className="size-4 text-pink-600" />
                  </span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">Meta</span>
                  {meta ? (
                    <span className="ml-auto text-xs font-medium text-emerald-600 dark:text-emerald-400">Connected</span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Facebook Pages and Instagram accounts.</p>
                <Button
                  type="button"
                  variant={meta ? "outline" : "default"}
                  className="mt-4 w-full rounded-xl"
                  disabled={metaBusy || meta}
                  onClick={() => void beginMeta()}
                >
                  {metaBusy ? <Loader2 className="size-4 animate-spin" /> : meta ? "Connected" : "Connect Meta"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 pt-5 dark:border-zinc-800 sm:flex-row sm:justify-end">
              <Button
                type="button"
                className="rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                onClick={() => {
                  setFirstWizardSession(true, "ready");
                  setStep("ready");
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === "ready" && (
          <div className="space-y-5 px-5 py-10 text-center sm:px-8">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="size-8" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">You are ready</h2>
            <p className="mx-auto max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
              Your workspace agent is configured. Jump into Workflow to build strategy and content — or revisit Settings anytime.
            </p>
            <Button
              type="button"
              className="rounded-xl bg-blue-600 px-8 font-semibold text-white shadow-md hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              onClick={finishOnboarding}
            >
              Enter workflow
            </Button>
          </div>
        )}

        {saving ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/90 backdrop-blur-sm dark:bg-zinc-950/85">
            <div className="w-full max-w-sm rounded-2xl border border-indigo-200 bg-white px-6 py-8 text-center shadow-xl dark:border-indigo-900/50 dark:bg-zinc-900">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                <Loader2 className="size-7 animate-spin" aria-hidden />
              </div>
              <p className="mt-5 text-base font-semibold text-zinc-900 dark:text-zinc-100">Creating your workspace</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Keep this tab open until loading finishes. If sound is on, you will hear a short status line—adjust Spoken voice
                above if the accent is unclear.
              </p>
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
                Uses your browser&apos;s built-in speech. For the cleanest Indian English, choose Indian English or Auto on Mac /
                Chrome when those voices are installed.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FirstRunWorkspaceWizard({
  push,
}: {
  push: (message: string, opts?: { kind?: "error" | "success"; durationMs?: number }) => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-zinc-400" />
        </div>
      }
    >
      <FirstRunWorkspaceWizardContent push={push} />
    </Suspense>
  );
}
