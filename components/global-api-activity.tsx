"use client";

import { useMemo } from "react";
import type { FlowApiLoadingKind } from "@/lib/api-loading-store";
import { useApiLoadingStore } from "@/lib/api-loading-store";
import { SparklesLoopLoader } from "@/components/sparkles-loop-loader";
import { cn } from "@/lib/utils";
import { useIndeterminateProgress } from "@/lib/use-indeterminate-progress";

function headlineFor(kind: FlowApiLoadingKind): string {
  switch (kind) {
    case "publish":
      return "Publishing";
    case "ai":
      return "AI processing";
    default:
      return "Syncing";
  }
}

function LoadingMark({ kind, workspaceSearch }: { kind: FlowApiLoadingKind; workspaceSearch: boolean }) {
  const isAi = kind === "ai";
  if (workspaceSearch && isAi) {
    return (
      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
        <SparklesLoopLoader />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-violet-800/80 dark:text-violet-100/90" fill="none" stroke="currentColor" strokeWidth="2.25">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    );
  }
  return <SparklesLoopLoader />;
}

export function GlobalApiActivity() {
  const visible = useApiLoadingStore((s) => s.visible);
  const headlineKind = useApiLoadingStore((s) => s.headlineKind);
  const inFlight = useApiLoadingStore((s) => s.inFlight);

  const processTitle = useMemo(() => {
    const match = [...inFlight].reverse().find((r) => r.kind === headlineKind);
    return (
      match?.processLabel ??
      inFlight[inFlight.length - 1]?.processLabel ??
      headlineFor(headlineKind)
    );
  }, [inFlight, headlineKind]);

  const activeCount = inFlight.length;
  const progress = useIndeterminateProgress(visible);
  const workspaceSearch = headlineKind === "ai" && processTitle.toLowerCase().includes("search");

  if (!visible) return null;

  const isAi = headlineKind === "ai";
  const isPublish = headlineKind === "publish";
  const showBlockingOverlay = isAi || isPublish;

  const barTrack = cn(
    isAi && "bg-violet-100/90 dark:bg-violet-950/40",
    isPublish && "bg-emerald-100/90 dark:bg-emerald-950/40",
    !isAi && !isPublish && "bg-zinc-200/90 dark:bg-zinc-800/90",
  );

  const barFill = cn(
    isAi &&
      "flow-gemini-bar-shimmer bg-gradient-to-r from-violet-700 via-fuchsia-500 to-violet-400 shadow-sm shadow-violet-500/25",
    isPublish &&
      "bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400 shadow-sm shadow-emerald-500/20",
    !isAi &&
      !isPublish &&
      "bg-gradient-to-r from-zinc-600 to-zinc-400 dark:from-zinc-400 dark:to-zinc-500",
  );

  const cardShell = cn(
    "pointer-events-none w-full max-w-[min(calc(100vw-2rem),24rem)] rounded-[1.35rem] border px-8 py-9 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)]",
    isAi &&
      "border-violet-200/70 bg-white/[0.97] ring-1 ring-violet-200/40 dark:border-violet-500/25 dark:bg-zinc-950/92 dark:ring-violet-500/15",
    isPublish &&
      "border-emerald-200/75 bg-white/[0.97] ring-1 ring-emerald-200/35 dark:border-emerald-500/25 dark:bg-zinc-950/92 dark:ring-emerald-500/12",
    !isAi &&
      !isPublish &&
      "border-zinc-200/85 bg-white/[0.97] ring-1 ring-zinc-200/50 dark:border-zinc-600/45 dark:bg-zinc-950/92 dark:ring-zinc-700/40",
  );

  const titleClass = cn(
    "text-[1.05rem] font-semibold leading-snug tracking-tight",
    isAi && "text-violet-950 dark:text-violet-100",
    isPublish && "text-emerald-950 dark:text-emerald-50",
    !isAi && !isPublish && "text-zinc-900 dark:text-zinc-50",
  );

  const pctClass = cn(
    "text-[1.65rem] font-semibold tabular-nums leading-none tracking-tight",
    isAi && "bg-gradient-to-br from-violet-700 to-fuchsia-500 bg-clip-text text-transparent dark:from-violet-300 dark:to-fuchsia-300",
    isPublish && "text-emerald-600 dark:text-teal-300",
    !isAi && !isPublish && "text-zinc-800 dark:text-zinc-100",
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-stretch"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={cn(
          "h-1 w-full overflow-hidden",
          isAi && "bg-violet-200/50 dark:bg-violet-900/50",
          isPublish && "bg-emerald-200/55 dark:bg-emerald-900/45",
          !isAi && !isPublish && "bg-zinc-200/90 dark:bg-zinc-700/80",
        )}
      >
        <div
          className={cn("h-full rounded-none transition-[width] duration-200 ease-out", barFill)}
          style={{ width: `${progress}%` }}
        />
      </div>

      {showBlockingOverlay ? (
        <div className="fixed inset-0 top-1 z-0 flex items-center justify-center bg-zinc-950/[0.28] px-4 pt-1 dark:bg-black/50">
          <div className={cardShell}>
            <div className="flex flex-col items-center gap-6">
              <LoadingMark kind={headlineKind} workspaceSearch={workspaceSearch} />

              <div className="w-full space-y-1.5 text-center">
                <p className={titleClass}>{processTitle}</p>
                <p className="text-[0.8rem] font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {activeCount > 1
                    ? `${activeCount} operations in progress`
                    : workspaceSearch
                      ? "Searching your workspace…"
                      : `${headlineFor(headlineKind)} — stay on this page`}
                </p>
              </div>

              <div className="w-full space-y-2.5">
                <div className="flex items-end justify-between gap-3">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                    Loading
                  </span>
                  <span className={pctClass}>
                    {progress}
                    <span
                      className={cn(
                        "ml-0.5 text-base font-bold tabular-nums",
                        isAi && "text-violet-400/80 dark:text-violet-300/70",
                        isPublish && "text-emerald-400/90 dark:text-emerald-400/80",
                        !isAi && !isPublish && "text-zinc-400 dark:text-zinc-500",
                      )}
                    >
                      %
                    </span>
                  </span>
                </div>
                <div className={cn("h-2 w-full overflow-hidden rounded-full", barTrack)}>
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-200 ease-out", barFill)}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-center text-[0.7rem] tabular-nums text-zinc-400 dark:text-zinc-500">
                  1–100 · estimated until complete
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
