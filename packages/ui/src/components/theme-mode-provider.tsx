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
   frame too late to prevent a white flash.

   ── WHY THE CHOSEN MODE IS AN EXTERNAL STORE, NOT PROVIDER STATE ──────────────

   It used to be `useState("system")` here plus an effect that read localStorage
   after mount, and the chosen mode reached consumers through context. That
   produced a real hydration mismatch on the theme toggle (three radio buttons,
   the server marking `system` active and the client marking `light` active in
   the same commit).

   The reason is ORDER, not the initial value: this provider sits near the root
   and hydrates early, so its effect had already pushed the localStorage value
   into context by the time a deeper subtree hydrated. That subtree then rendered
   the REAL mode against server HTML written for "system" — React compares them
   and gives up on the difference ("this won't be patched up"), leaving the wrong
   button visibly active until something re-rendered it.

   `useSyncExternalStore` is React's own answer to exactly this: while a
   component is hydrating it is served `getServerSnapshot()` — "system" — no
   matter what any earlier effect has already learned, and it switches to the
   real value in a normal post-hydration render. A component that mounts LATER
   (a popover opened by the user, say) gets the real value on its FIRST render,
   so nothing flickers there either. A "mounted" boolean in each consumer would
   have fixed the hydration case and broken that one.

   Consequence worth knowing: every consumer reads the store directly, so the
   context carries only the presence flag that makes `useThemeMode` outside a
   provider a loud error rather than a silently dead toggle. */
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

/** Shared across every Edura surface, so a choice made in one carries to the next. */
const STORAGE_KEY = "edura-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

/* ── The store ────────────────────────────────────────────────────────────────
   Module-level on purpose: the browser has exactly one localStorage and one
   colour-scheme preference, so two providers on a page must not be able to hold
   two different opinions about them. */

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

/* Cached because `useSyncExternalStore` calls these on every render and requires
   a value that only changes when the store does — an uncached read would also
   hit localStorage each time. */
function getMode(): ThemeMode {
  if (modeCache === null) modeCache = readMode();
  return modeCache;
}

function getSystemDark(): boolean {
  if (systemDarkCache === null) systemDarkCache = readSystemDark();
  return systemDarkCache;
}

/* What the server rendered, and therefore what a hydrating component must see.
   `theme-init.js` has already painted the right colours by then; these two
   values only decide which control reads as active for one render. */
const getServerMode = (): ThemeMode => "system";
const getServerSystemDark = (): boolean => false;

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  /* One set of watchers for the document's lifetime, attached on first use and
     deliberately never removed — they are two listeners, and tearing them down
     when the last consumer unmounts would only re-attach them on the next one. */
  if (!watching) {
    watching = true;
    window.matchMedia?.(MEDIA_QUERY).addEventListener?.("change", (e) => {
      systemDarkCache = e.matches;
      emit();
    });
    /* Another tab changed the choice: re-read rather than trust the event's
       newValue, so a cleared key falls back through the same path. */
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

  /* After the hooks, never before them: the throw is a developer-facing guard
     and must not change the hook order of the render it aborts. */
  if (!withinProvider)
    throw new Error("useThemeMode must be used within ThemeModeProvider");

  return value;
}
