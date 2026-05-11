"use client";

import { getAuthUser } from "@/lib/auth";

export type AiCompletionJobKind = "strategy" | "content";

const BASE_STRATEGY = "fp_ai_notify_strategy_choice";
const BASE_CONTENT = "fp_ai_notify_content_choice";

function scopedBase(kind: AiCompletionJobKind): string {
  const email = getAuthUser()?.email?.trim().toLowerCase();
  const prefix = kind === "strategy" ? BASE_STRATEGY : BASE_CONTENT;
  return email ? `${prefix}.${email}` : prefix;
}

/** Stored when user ticks "remember": "1" = notify, "0" = silent. */
export function getRememberedAiNotifyPreference(kind: AiCompletionJobKind): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(scopedBase(kind));
    if (raw === "1") return true;
    if (raw === "0") return false;
    return undefined;
  } catch {
    return undefined;
  }
}

export function setRememberedAiNotifyPreference(kind: AiCompletionJobKind, wantNotify: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedBase(kind), wantNotify ? "1" : "0");
  } catch {
    /* ignore quota */
  }
}
