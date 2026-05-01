"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type ToastItem = { id: string; title: string };
export type ToastPushOptions = { durationMs?: number };

const ToastContext = createContext<{ push: (title: string, options?: ToastPushOptions) => void } | null>(null);

const DEFAULT_TOAST_MS = 2600;
const MIN_TOAST_MS = 1500;
const MAX_TOAST_MS = 30_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((title: string, options?: ToastPushOptions) => {
    const id = `${Date.now()}-${Math.random()}`;
    const raw = options?.durationMs ?? DEFAULT_TOAST_MS;
    const durationMs = Math.min(MAX_TOAST_MS, Math.max(MIN_TOAST_MS, raw));
    setToasts((items) => [...items, { id, title }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), durationMs);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[220] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-lg ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {toast.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
