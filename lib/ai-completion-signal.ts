"use client";

import type { AiCompletionJobKind } from "@/lib/ai-completion-notify-preference";

function playCompletionChime(): void {
  try {
    type AudioCtor = new (contextOptions?: AudioContextOptions | undefined) => AudioContext;
    const g = globalThis as typeof globalThis & {
      AudioContext?: AudioCtor;
      webkitAudioContext?: AudioCtor;
    };
    const AudioContextCtor = g.AudioContext ?? g.webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, ctx.currentTime);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.46);
    const close = ctx.close.bind(ctx);
    window.setTimeout(() => {
      close().catch(() => undefined);
    }, 650);
  } catch {
    /* ignore unsupported audio */
  }
}

function desktopNotify(kind: AiCompletionJobKind, title: string, body: string): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  try {
    if (Notification.permission === "granted") {
      // eslint-disable-next-line no-new
      new Notification(title, { body, tag: `flowpilot-ai-${kind}-${Date.now()}`, silent: false });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Short chime + optional OS notification after a long-running AI workflow step.
 */
export function signalAiWorkflowComplete(kind: AiCompletionJobKind, title: string, body: string): void {
  playCompletionChime();
  desktopNotify(kind, title, body);
}

/** Prompt the browser — call when the user opts in, before starting the job. */
export function primeDesktopNotificationPermission(): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission().catch(() => undefined);
  }
}
