"use client";

import { Sparkles } from "lucide-react";
import {
  selectAiPipelineJobActive,
  selectAiPipelineStatusMessage,
  useAiPipelineJobStore,
} from "@/lib/ai-pipeline-job-store";
import { useElapsedSecondsWhileActive, useSimulatedAiProgress } from "@/hooks/use-simulated-ai-progress";
import { cn } from "@/lib/utils";

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/** Non-blocking indicator while strategy/content agents run — survives workflow tab changes. */
export function AiPipelineActivityBanner() {
  const active = useAiPipelineJobStore(selectAiPipelineJobActive);
  const message = useAiPipelineJobStore(selectAiPipelineStatusMessage);
  const progress = useSimulatedAiProgress(active);
  const elapsedSec = useElapsedSecondsWhileActive(active);

  if (!active || !message) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[95] flex justify-center px-3 pt-2"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-xl border border-violet-200/90",
          "bg-white/95 px-4 py-2.5 shadow-lg shadow-violet-900/10 backdrop-blur-md",
          "dark:border-violet-500/30 dark:bg-zinc-950/95 dark:shadow-black/40",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
          <Sparkles className="size-4 animate-pulse" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-violet-950 dark:text-violet-100">{message}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Safe to switch tabs — this run continues in the background · {formatElapsed(elapsedSec)} · {progress}%
          </p>
        </div>
        <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-violet-100 sm:block dark:bg-violet-950/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
