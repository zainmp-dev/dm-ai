"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGetOpenrouterBalance, type OpenrouterBalance } from "@/lib/api";

function formatUsd(n: number, maxFrac = 4) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: maxFrac });
}

// One in-flight balance fetch + 60s freshness cap shared across mounts (Strict-Mode + visibility events).
const BALANCE_MIN_INTERVAL_MS = 60_000;
let balanceInflight: Promise<OpenrouterBalance> | null = null;
let lastBalanceAt = 0;
let lastBalanceValue: OpenrouterBalance | null = null;

async function fetchBalanceThrottled(force = false): Promise<OpenrouterBalance> {
  if (balanceInflight) return balanceInflight;
  const now = Date.now();
  if (!force && lastBalanceValue && now - lastBalanceAt < BALANCE_MIN_INTERVAL_MS) {
    return lastBalanceValue;
  }
  balanceInflight = (async () => {
    try {
      const data = await apiGetOpenrouterBalance();
      lastBalanceValue = data;
      lastBalanceAt = Date.now();
      return data;
    } finally {
      balanceInflight = null;
    }
  })();
  return balanceInflight;
}

export function OpenrouterBalanceHint() {
  const [balance, setBalance] = useState<OpenrouterBalance | null>(lastBalanceValue);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async (force = false) => {
    try {
      const data = await fetchBalanceThrottled(force);
      if (!mountedRef.current) return;
      setBalance(data);
      setFailed(false);
    } catch {
      if (!mountedRef.current) return;
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Defer so GET /workspace wins the race on shell mount (OpenRouter /key can be slow).
    const t = window.setTimeout(() => void load(false), 350);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(t);
    };
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => void load(true), 120_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  if (failed) {
    return <p className="text-[10px] leading-tight text-zinc-500 dark:text-zinc-500">OpenRouter balance unavailable</p>;
  }
  if (!balance) {
    return <p className="text-[10px] text-zinc-400">…</p>;
  }
  if (!balance.configured) {
    return (
      <p
        className="max-w-[15rem] text-[10px] leading-tight text-amber-800 dark:text-amber-300"
        title={balance.message}
      >
        Set OPENROUTER_API_KEY on the server for usage and limit info.
      </p>
    );
  }
  if (balance.error) {
    return (
      <p className="max-w-[15rem] truncate text-[10px] text-amber-800 dark:text-amber-300" title={balance.error}>
        OpenRouter: check API key
      </p>
    );
  }

  const limit = balance.limit;
  const remaining = balance.limit_remaining;
  const hasSpendCap = limit != null;
  const daily = balance.usage_daily ?? 0;
  const low =
    hasSpendCap &&
    remaining != null &&
    limit != null &&
    limit > 0 &&
    remaining / limit < 0.05 &&
    remaining > 0;
  const depleted = hasSpendCap && remaining != null && remaining <= 0;

  const parts: string[] = [];
  if (hasSpendCap && remaining != null) {
    parts.push(`Left $${formatUsd(remaining)}`);
  } else {
    parts.push("");
  }
  if (daily > 0) {
    parts.push(`24h $${formatUsd(daily, 3)}`);
  }
  if (depleted) {
    parts.push("depleted");
  }

  return (
    <p
      className={
        low || depleted
          ? "max-w-[18rem] text-[10px] leading-tight text-red-700 dark:text-red-400"
          : "max-w-[18rem] text-[10px] leading-tight text-zinc-500 dark:text-zinc-400"
      }
      title="OpenRouter /api/v1/key — one balance for the whole key; each model use reduces remaining credits. Per-model price differs; shared pool is not split by model in the API."
    >
      {parts.join(" · ")}
    </p>
  );
}
