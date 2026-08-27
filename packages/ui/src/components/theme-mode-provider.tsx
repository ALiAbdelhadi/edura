"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
type Resolved = "light" | "dark";

type ThemeModeContextValue = {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const ThemeModeContext = createContext<boolean>(false);

const STORAGE_KEY = "edura-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set<() => void>();
let modeCache: ThemeMode | null = null;
let systemDarkCache: boolean | null = null;
let watching = false;

function emit() {
  for (const l of listeners) l();
}

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {}
  return "system";
}

function readSystemDark(): boolean {
  return window.matchMedia?.(MEDIA_QUERY).matches ?? false;
}

function getMode(): ThemeMode {
  if (modeCache === null) modeCache = readMode();
  return modeCache;
}

function getSystemDark(): boolean {
  if (systemDarkCache === null) systemDarkCache = readSystemDark();
  return systemDarkCache;
}

const getServerMode = (): ThemeMode => "system";
const getServerSystemDark = (): boolean => false;

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (!watching) {
    watching = true;
    window.matchMedia?.(MEDIA_QUERY).addEventListener?.("change", (e) => {
      systemDarkCache = e.matches;
      emit();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key === STORAGE_KEY) {
        modeCache = null;
        emit();
      }
    });
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

function writeMode(m: ThemeMode) {
  modeCache = m;
  try {
    localStorage.setItem(STORAGE_KEY, m);
  } catch {}
  emit();
}

function useStore(): { mode: ThemeMode; resolved: Resolved } {
  const mode = useSyncExternalStore(subscribe, getMode, getServerMode);
  const systemDark = useSyncExternalStore(
    subscribe,
    getSystemDark,
    getServerSystemDark,
  );
  const resolved: Resolved =
    mode === "system" ? (systemDark ? "dark" : "light") : mode;
  return { mode, resolved };
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const { resolved } = useStore();

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-theme", resolved);
    el.style.colorScheme = resolved;
  }, [resolved]);

  return (
    <ThemeModeContext.Provider value={true}>
      {children}
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const withinProvider = useContext(ThemeModeContext);
  const { mode, resolved } = useStore();

  const setMode = useCallback((m: ThemeMode) => writeMode(m), []);
  const toggle = useCallback(
    () => writeMode(resolved === "dark" ? "light" : "dark"),
    [resolved],
  );

  const value = useMemo<ThemeModeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  if (!withinProvider)
    throw new Error("useThemeMode must be used within ThemeModeProvider");

  return value;
}
