"use client";

import { useEffect, useState } from "react";

/** Soft indeterminate 1–100% progress for loading strips (no harsh jumps). */
export function useIndeterminateProgress(active: boolean): number {
  const [pct, setPct] = useState(1);

  useEffect(() => {
    if (!active) return;

    let raf = 0;
    const start = performance.now();
    // Defer so we don't sync setState in the effect body (eslint set-state-in-effect).
    raf = requestAnimationFrame(function tick() {
      const elapsed = performance.now() - start;
      const t = 1 - Math.exp(-elapsed / 2600);
      const next = Math.min(100, Math.max(1, Math.round(2 + t * 98)));
      setPct(next);
      raf = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(raf);
  }, [active]);

  return active ? pct : 1;
}
