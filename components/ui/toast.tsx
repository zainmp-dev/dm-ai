"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { Toaster, toast } from "sonner";

export type ToastPushOptions = {
  durationMs?: number;
  kind?: "success" | "error" | "info";
};

const ToastContext = createContext<{ push: (title: string, options?: ToastPushOptions) => void } | null>(null);

const DEFAULT_TOAST_MS = 2600;
const MIN_TOAST_MS = 1500;
const MAX_TOAST_MS = 30_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const push = useCallback((title: string, options?: ToastPushOptions) => {
    const raw = options?.durationMs ?? DEFAULT_TOAST_MS;
    const durationMs = Math.min(MAX_TOAST_MS, Math.max(MIN_TOAST_MS, raw));
    const kind = options?.kind ?? "info";
    if (kind === "success") {
      toast.success(title, { duration: durationMs });
      return;
    }
    if (kind === "error") {
      toast.error(title, { duration: durationMs });
      return;
    }
    toast(title, { duration: durationMs });
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        richColors
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(15, 23, 42, 0.86)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#f8fafc",
            backdropFilter: "blur(14px)",
          },
        }}
      />
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
