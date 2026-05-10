"use client";

import { useServerInsertedHTML } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "flow-theme";

// Runs before first paint to apply the saved theme and avoid a flash.
// Injected via useServerInsertedHTML so React 19 doesn't warn about a
// <script> tag rendered inside a component (Next.js 16 / React 19 behavior).
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`;

type ThemeContextValue = {
  theme: Theme;
  setTheme: (next: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(onStoreChange: () => void) {
  const el = document.documentElement;
  const obs = new MutationObserver(() => onStoreChange());
  obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function persistAndApply(next: Theme) {
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useServerInsertedHTML(() => (
    <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
  ));

  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((next: Theme) => {
    persistAndApply(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
