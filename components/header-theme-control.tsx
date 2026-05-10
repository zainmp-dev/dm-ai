"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function HeaderThemeControl() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex size-8 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f5f7fa] hover:text-[#111827] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {isDark ? <Sun className="size-[17px]" strokeWidth={1.75} /> : <Moon className="size-[17px]" strokeWidth={1.75} />}
    </button>
  );
}
