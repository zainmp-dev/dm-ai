"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

type Variant = "floating" | "inline";

export function PublicThemeToggle({
  variant = "inline",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const base =
    "flex size-9 items-center justify-center rounded-xl border text-[#374151] transition-colors hover:text-[#111827] dark:text-zinc-300 dark:hover:text-zinc-100";
  const surface =
    "border-slate-200 bg-white shadow-sm hover:bg-[#f5f7fa] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800";
  const floating = "fixed right-4 top-4 z-[60]";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(base, surface, variant === "floating" && floating, className)}
    >
      {isDark ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
    </button>
  );
}
