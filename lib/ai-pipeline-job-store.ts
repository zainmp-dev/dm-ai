"use client";

import { create } from "zustand";

export type AiBootstrapStage = "idle" | "strategy" | "content";

type AiPipelineJobState = {
  strategyRunning: boolean;
  contentRunning: boolean;
  bootstrapStage: AiBootstrapStage;
  /** Prevents auto-bootstrap from firing again after tab unmount/remount mid-run. */
  bootstrapClaimed: boolean;
  beginStrategy: () => void;
  endStrategy: () => void;
  beginContent: () => void;
  endContent: () => void;
  setBootstrapStage: (stage: AiBootstrapStage) => void;
  /** Returns false when bootstrap was already claimed for this empty-workspace cycle. */
  claimBootstrap: () => boolean;
  resetBootstrapClaim: () => void;
  resetAll: () => void;
};

/** Defer store writes so they never run during another component's render/mount phase. */
function scheduleJobStoreUpdate(update: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(update);
    return;
  }
  setTimeout(update, 0);
}

export const useAiPipelineJobStore = create<AiPipelineJobState>()((set, get) => ({
  strategyRunning: false,
  contentRunning: false,
  bootstrapStage: "idle",
  bootstrapClaimed: false,
  beginStrategy: () => scheduleJobStoreUpdate(() => set({ strategyRunning: true })),
  endStrategy: () => scheduleJobStoreUpdate(() => set({ strategyRunning: false })),
  beginContent: () => scheduleJobStoreUpdate(() => set({ contentRunning: true })),
  endContent: () => scheduleJobStoreUpdate(() => set({ contentRunning: false })),
  setBootstrapStage: (stage) => scheduleJobStoreUpdate(() => set({ bootstrapStage: stage })),
  claimBootstrap: () => {
    if (get().bootstrapClaimed) return false;
    set({ bootstrapClaimed: true });
    return true;
  },
  resetBootstrapClaim: () => scheduleJobStoreUpdate(() => set({ bootstrapClaimed: false, bootstrapStage: "idle" })),
  resetAll: () =>
    scheduleJobStoreUpdate(() =>
      set({
        strategyRunning: false,
        contentRunning: false,
        bootstrapStage: "idle",
        bootstrapClaimed: false,
      }),
    ),
}));

export function selectAiPipelineJobActive(s: AiPipelineJobState): boolean {
  return s.strategyRunning || s.contentRunning || s.bootstrapStage !== "idle";
}

export function selectAiPipelineStatusMessage(s: AiPipelineJobState): string {
  if (s.bootstrapStage === "strategy") {
    return "Setting up strategy and competitors…";
  }
  if (s.bootstrapStage === "content") {
    return "Building your starter content calendar…";
  }
  if (s.strategyRunning) return "Updating strategy and competitor insights…";
  if (s.contentRunning) return "Writing your post ideas and schedule…";
  return "";
}
