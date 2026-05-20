"use client";

import { useEffect } from "react";
import { requestAiCompletionNotifyPreference } from "@/components/ai-completion-notify-bridge";
import { useToast } from "@/components/ui/toast";
import { useAiPipelineJobStore } from "@/lib/ai-pipeline-job-store";
import { apiErrorMessage } from "@/lib/api";
import type { WorkspaceSnapshot } from "@/lib/types";
import { useWorkspaceStore } from "@/lib/workspace-store";

const BOOTSTRAP_CALENDAR_DAYS = 7;

function effectiveWorkspaceCompanyName(w: WorkspaceSnapshot): string {
  const a = w.companyName.trim();
  if (a) return a;
  return w.profile.company.trim();
}

/**
 * Auto-runs strategy + content when the workspace has no AI output yet.
 * Lives on the pipeline shell (not Command Center) so tab switches do not remount it mid-run.
 */
export function AiPipelineBootstrap() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const generateStrategy = useWorkspaceStore((s) => s.generateStrategy);
  const generateContent = useWorkspaceStore((s) => s.generateContent);
  const { push } = useToast();

  const workspaceReady = Boolean(
    workspace?.companyName?.trim() ||
      workspace?.profile.company?.trim() ||
      workspace?.workspaceConfigured,
  );
  const aiOutputMissing = Boolean(workspaceReady && workspace && !workspace.strategy && workspace.content.length === 0);

  useEffect(() => {
    if (!aiOutputMissing) return;

    const snap = useWorkspaceStore.getState().workspace;
    if (!snap) return;

    const company = effectiveWorkspaceCompanyName(snap);
    if (!company.trim()) return;

    if (!useAiPipelineJobStore.getState().claimBootstrap()) return;

    let cancelled = false;
    const job = useAiPipelineJobStore.getState();

    const runBootstrap = async () => {
      const website = snap.companyWebsite.trim();
      job.setBootstrapStage("strategy");
      try {
        await generateStrategy(company, website, { competitors: [], completionNotify: false });
      } catch (e) {
        if (cancelled) return;
        const msg = apiErrorMessage(e);
        push(
          msg.length > 100
            ? "Strategy step didn’t finish after trying multiple fast models. Check your connection and tap Run AI setup again."
            : msg,
        );
        job.setBootstrapStage("idle");
        return;
      }
      if (cancelled) return;

      job.setBootstrapStage("content");
      try {
        const notify = await requestAiCompletionNotifyPreference("content");
        await generateContent(BOOTSTRAP_CALENDAR_DAYS, { completionNotify: notify });
        if (cancelled) return;
        const usedFree = useWorkspaceStore.getState().lastRunUsedFreeModel;
        push(
          usedFree
            ? `All set — your starter ${BOOTSTRAP_CALENDAR_DAYS}-day plan is ready. It used a backup mode; runs can be quicker once more AI credits are available.`
            : `All set — your starter ${BOOTSTRAP_CALENDAR_DAYS}-day plan is ready. Use the calendar buttons below if you want more weeks at once.`,
        );
      } catch (e) {
        if (cancelled) return;
        const msg = apiErrorMessage(e);
        push(
          `Strategy is saved, but the ${BOOTSTRAP_CALENDAR_DAYS}-day calendar didn’t finish: ${msg.length > 90 ? `${msg.slice(0, 90)}…` : msg}. Tap “Run AI setup now” below to retry the calendar step — alternate models run automatically.`,
        );
      } finally {
        if (!cancelled) {
          job.setBootstrapStage("idle");
        }
      }
    };

    void runBootstrap();

    return () => {
      cancelled = true;
    };
  }, [aiOutputMissing, generateStrategy, generateContent, push]);

  return null;
}
