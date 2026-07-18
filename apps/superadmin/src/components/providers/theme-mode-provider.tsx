"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
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
