"use client";

import { startTransition, useEffect, useState } from "react";

/**
 * Smooth 4–92% while `active`; snap to 100% when done, then reset.
 *
 * The step rate slows as elapsed time grows so the bar stays honest for both
 * fast paid-model runs (~60s) and slow free-model fallback runs (~5-8 min).
 * - 0-60s: normal speed, reaches ~65%
 * - 60-180s: 25% speed, creeps toward ~80%
 * - 180s+: 8% speed, barely ticks — keeps users informed without lying
 */
export function useSimulatedAiProgress(active: boolean): number {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) {
      startTransition(() => setPct((prev) => (prev >= 5 ? 100 : prev)));
      const t = window.setTimeout(() => startTransition(() => setPct(0)), 850);
      return () => window.clearTimeout(t);
    }

    startTransition(() => setPct(4));
    const startTime = Date.now();
    const id = window.setInterval(() => {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const timeFactor = elapsedSec < 60 ? 1.0 : elapsedSec < 180 ? 0.25 : 0.08;
      setPct((p) => {
        if (p >= 92) return p;
        const gap = 92 - p;
        const base = gap > 55 ? 2.8 : gap > 28 ? 1.25 : gap > 12 ? 0.65 : 0.38;
        return Math.min(92, p + base * timeFactor);
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
      startTransition(() => setSecs(0));
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
