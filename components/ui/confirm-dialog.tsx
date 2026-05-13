"use client";

import { AlertTriangle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: red confirm (remove, unpublish, …). neutral: default primary confirm. */
  variant?: "danger" | "neutral";
};

type OpenState = ConfirmOptions & { open: true };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...opts, open: true, variant: opts.variant ?? "neutral" });
    });
  }, []);

  const finish = useCallback((result: boolean) => {
    const r = resolveRef.current;
    resolveRef.current = null;
    setState(null);
    r?.(result);
  }, []);

  const variant = state?.variant ?? "neutral";
  const confirmLabel = state?.confirmLabel ?? "Confirm";
  const cancelLabel = state?.cancelLabel ?? "Cancel";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state !== null} onOpenChange={(open) => !open && finish(false)}>
        {state ? (
          <DialogContent className="max-w-md gap-0 border-[#e5e7eb] bg-white p-0 dark:border-zinc-800 dark:bg-[#161618] sm:max-w-md">
            <DialogHeader className="space-y-2 border-b border-zinc-100 p-6 pb-4 text-left dark:border-zinc-800">
              <div className="flex gap-3 pr-8">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    variant === "danger"
                      ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                  )}
                  aria-hidden
                >
                  <AlertTriangle className="size-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <DialogTitle className="text-[17px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                    {state.title}
                  </DialogTitle>
                  {state.description ? (
                    <DialogDescription asChild>
                      <div className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{state.description}</div>
                    </DialogDescription>
                  ) : null}
                </div>
              </div>
            </DialogHeader>
            <DialogFooter className="gap-2 border-t border-zinc-100 p-6 dark:border-zinc-800 sm:justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => finish(false)}>
                {cancelLabel}
              </Button>
              {variant === "danger" ? (
                <Button type="button" variant="destructive" className="rounded-xl font-medium" onClick={() => finish(true)}>
                  {confirmLabel}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="rounded-xl bg-[#1a56db] font-medium text-white hover:bg-[#1746b3] dark:bg-blue-600 dark:hover:bg-blue-500"
                  onClick={() => finish(true)}
                >
                  {confirmLabel}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
