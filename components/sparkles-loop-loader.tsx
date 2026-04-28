"use client";

import Lottie from "lottie-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const LOTTIE_PUBLIC_PATH = "/Sparkles%20Loop%20Loader.json";

type SparklesLoopLoaderProps = {
  className?: string;
};

export function SparklesLoopLoader({ className }: SparklesLoopLoaderProps) {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(LOTTIE_PUBLIC_PATH)
      .then((r) => {
        if (!r.ok) throw new Error("lottie");
        return r.json() as Promise<unknown>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={cn("flex h-24 w-24 shrink-0 items-center justify-center", className)} aria-hidden>
      {data ? (
        <Lottie animationData={data} loop className="h-full w-full" />
      ) : (
        <div className="h-[80%] w-[80%] min-h-12 min-w-12 rounded-2xl bg-gradient-to-br from-violet-200/40 to-fuchsia-200/30 dark:from-violet-900/30 dark:to-fuchsia-900/20" />
      )}
    </div>
  );
}
