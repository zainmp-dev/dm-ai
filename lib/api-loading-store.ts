"use client";

import { create } from "zustand";

export type FlowApiLoadingKind = "default" | "ai" | "publish";

type Counts = Record<FlowApiLoadingKind, number>;

export type FlowInFlightRequest = {
  id: string;
  kind: FlowApiLoadingKind;
  processLabel: string;
};

type State = {
  inFlight: FlowInFlightRequest[];
  visible: boolean;
  headlineKind: FlowApiLoadingKind;
  begin: (id: string, kind: FlowApiLoadingKind, processLabel: string) => void;
  end: (id: string) => void;
};

function countsFromInFlight(inFlight: FlowInFlightRequest[]): Counts {
  const c: Counts = { default: 0, ai: 0, publish: 0 };
  for (const r of inFlight) {
    c[r.kind] += 1;
  }
  return c;
}

function pickHeadline(counts: Counts): FlowApiLoadingKind {
  if (counts.publish > 0) return "publish";
  if (counts.ai > 0) return "ai";
  return "default";
}

let revealTimer: ReturnType<typeof setTimeout> | null = null;
const REVEAL_MS = 130;

export const useApiLoadingStore = create<State>()((set, get) => ({
  inFlight: [],
  visible: false,
  headlineKind: "default",
  begin: (id, kind, processLabel) => {
    const inFlight = [...get().inFlight, { id, kind, processLabel }];
    const headlineKind = pickHeadline(countsFromInFlight(inFlight));
    set({ inFlight, headlineKind });
    const visible = get().visible;
    if (inFlight.length > 0 && !visible && revealTimer == null) {
      revealTimer = setTimeout(() => {
        revealTimer = null;
        if (get().inFlight.length > 0) {
          set({
            visible: true,
            headlineKind: pickHeadline(countsFromInFlight(get().inFlight)),
          });
        }
      }, REVEAL_MS);
    }
  },
  end: (id) => {
    const inFlight = get().inFlight.filter((r) => r.id !== id);
    const headlineKind = pickHeadline(countsFromInFlight(inFlight));
    set({ inFlight, headlineKind });
    if (inFlight.length === 0) {
      if (revealTimer != null) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }
      set({ visible: false });
    }
  },
}));

export function notifyApiRequestStart(
  kind: FlowApiLoadingKind,
  processLabel: string,
  requestId: string,
) {
  if (typeof window === "undefined") return;
  useApiLoadingStore.getState().begin(requestId, kind, processLabel);
}

export function notifyApiRequestEnd(requestId: string) {
  if (typeof window === "undefined") return;
  useApiLoadingStore.getState().end(requestId);
}
