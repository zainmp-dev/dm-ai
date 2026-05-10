"use client";

import { usePathname, useServerInsertedHTML } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "flow-theme";

// Runs before first paint to apply the saved theme and avoid a flash.
// Default is light when nothing is stored.
const THEME_INIT_SCRIPT = `(function(){try{
var t=localStorage.getItem('${STORAGE_KEY}');
var dark = t==='dark';
var el=document.documentElement;
if(dark){el.classList.add('dark');el.style.colorScheme='dark';}
else{el.classList.remove('dark');el.style.colorScheme='light';}
}catch(e){}})()`;

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
  const el = document.documentElement;
  el.classList.toggle("dark", next === "dark");
  el.style.colorScheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
}

function applyStoredTheme() {
  const el = document.documentElement;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  const dark = stored === "dark";
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useServerInsertedHTML(() => (
    <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
  ));

  const pathname = usePathname();
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Re-apply on client-side route changes so the stored preference stays
  // in sync (handy if another tab updates it).
  useEffect(() => {
    applyStoredTheme();
  }, [pathname]);

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
