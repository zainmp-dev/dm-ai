"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { AiCompletionJobKind } from "@/lib/ai-completion-notify-preference";
import { getRememberedAiNotifyPreference, setRememberedAiNotifyPreference } from "@/lib/ai-completion-notify-preference";
import { primeDesktopNotificationPermission } from "@/lib/ai-completion-signal";

type Pending = {
  kind: AiCompletionJobKind;
  resolver: (wantNotify: boolean) => void;
};

type AiCompletionNotifyUiState = {
  pending: Pending | null;
  openPrompt: (p: Pending) => void;
  clear: () => void;
};

const useAiCompletionNotifyUiStore = create<AiCompletionNotifyUiState>()((set) => ({
  pending: null,
  openPrompt: (p) => set({ pending: p }),
  clear: () => set({ pending: null }),
}));

export function requestAiCompletionNotifyPreference(kind: AiCompletionJobKind): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const remembered = getRememberedAiNotifyPreference(kind);
  if (remembered !== undefined) return Promise.resolve(remembered);
  return new Promise((resolve) => {
    useAiCompletionNotifyUiStore.getState().openPrompt({ kind, resolver: resolve });
  });
}

const COPY: Record<AiCompletionJobKind, { title: string; body: string; rememberLabel: string }> = {
  strategy: {
    title: "Strategy run",
    body: "Generating strategy can take a few minutes — you can switch tabs. When it finishes, should we play a short sound and show a desktop alert (where your browser allows)?",
    rememberLabel: "Remember my choice for strategy runs",
  },
  content: {
    title: "Content calendar run",
    body: "Building your calendar can take a few minutes — you can switch tabs. When it finishes, should we play a short sound and show a desktop alert (where allowed)?",
    rememberLabel: "Remember my choice for content runs",
  },
};

export function AiCompletionNotifyBridge() {
  const pending = useAiCompletionNotifyUiStore((s) => s.pending);
  const clear = useAiCompletionNotifyUiStore((s) => s.clear);
  const [remember, setRemember] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(Boolean(pending));
  }, [pending]);

  const finish = (wantNotify: boolean) => {
    const p = pending;
    if (!p) return;
    if (wantNotify) primeDesktopNotificationPermission();
    if (remember) setRememberedAiNotifyPreference(p.kind, wantNotify);
    p.resolver(wantNotify);
    clear();
    setRemember(false);
    setOpen(false);
  };

  const dialogOpen = Boolean(pending) && open;

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(next) => {
        if (!next && pending) {
          finish(false);
        }
      }}
    >
      <DialogContent className="max-w-md rounded-2xl">
        {pending ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>{COPY[pending.kind].title}</DialogTitle>
              <DialogDescription className="text-zinc-600 dark:text-zinc-400">{COPY[pending.kind].body}</DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
              <input
                id="fp-ai-notify-remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-zinc-300 text-[#1a56db] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a56db]"
              />
              <Label htmlFor="fp-ai-notify-remember" className="cursor-pointer text-sm font-normal leading-snug text-zinc-700 dark:text-zinc-300">
                {COPY[pending.kind].rememberLabel}
              </Label>
            </div>

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => finish(false)}>
                No
              </Button>
              <Button type="button" className="rounded-xl bg-[#1a56db] text-white hover:bg-[#1648c0]" onClick={() => finish(true)}>
                Yes
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
