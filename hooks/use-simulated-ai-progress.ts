"use client";

import { useEffect, useState } from "react";

/**
 * Smooth 4–96% while `active` (timer-based, not streamed from the server); snap to 100% when deactivated, then reset.
 */
export function useSimulatedAiProgress(active: boolean): number {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) {
      setPct((prev) => (prev >= 5 ? 100 : prev));
      const t = window.setTimeout(() => setPct(0), 850);
      return () => window.clearTimeout(t);
    }

    setPct(4);
    const id = window.setInterval(() => {
      setPct((p) => {
        if (p >= 96) return p;
        const gap = 96 - p;
        const step = gap > 55 ? 2.8 : gap > 28 ? 1.25 : gap > 12 ? 0.65 : 0.38;
        return Math.min(96, p + step);
      });
    }, 320);
    return () => window.clearInterval(id);
  }, [active]);

  return Math.min(100, Math.round(pct));
}

/** Wall-clock seconds since `active` became true; resets when `active` is false. */
export function useElapsedSecondsWhileActive(active: boolean): number {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!active) {
      setSecs(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setSecs(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return secs;
}
