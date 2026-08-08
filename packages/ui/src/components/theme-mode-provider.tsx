/* The theme mechanism, in ONE place.
   ══════════════════════════════════════════════════════════════════════════════

   `apps/www` and `apps/superadmin` each carried a byte-identical copy of this
   file. Nothing had drifted yet — but the palette drift documented at the top of
   `styles/globals.css` began exactly this way, as two copies nobody had a reason
   to disagree about. Adding a third copy for the showcase is how that happens
   again, so the implementation moved here and both apps re-export it.

   The contract is unchanged from those copies, deliberately:

     mode      what the user CHOSE — "light" | "dark" | "system"
     resolved  what is actually rendered — "light" | "dark"

   Two values rather than one because "system" is a real, persistable choice: a
   user who picks it wants the OS to keep deciding, including when the OS changes
   its mind mid-session. Collapsing them would silently freeze that.

   The attribute is written on <html>, which is what `[data-theme="dark"]` in the
   token sheet selects, alongside `color-scheme` so form controls, scrollbars and
   the caret follow. The FIRST paint is handled by `public/theme-init.js`, a
   blocking inline-style script — this provider runs in an effect, which is one
   frame too late to prevent a white flash. */
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
type Resolved = "light" | "dark";

type ThemeModeContextValue = {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

/** Shared across every Edura surface, so a choice made in one carries to the next. */
const STORAGE_KEY = "edura-theme";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemDark, setSystemDark] = useState<boolean>(false);

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" &&
      localStorage.getItem(STORAGE_KEY)) as ThemeMode | null;
    if (saved === "light" || saved === "dark" || saved === "system")
      setModeState(saved);
    setSystemDark(systemPrefersDark());
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const resolved: Resolved =
    mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-theme", resolved);
    el.style.colorScheme = resolved;
  }, [resolved]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setMode]);

  const value = useMemo<ThemeModeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx)
    throw new Error("useThemeMode must be used within ThemeModeProvider");
  return ctx;
}
