"use client";

const STORAGE_KEY = "edura-v2-theme";

/**
 * Theme is a two-state toggle, not a three-state menu.
 *
 * THE SHARED SHEET DRIVES DARK FROM `data-theme="dark"` ALONE — its custom
 * variant is `&:where([data-theme="dark"], …)` and it carries no
 * `prefers-color-scheme` branch at all. So the attribute must ALWAYS be
 * present: the bootstrap below stamps it from the stored choice, or from the
 * OS preference when there is no stored choice. Leaving it absent for an
 * OS-dark reader would serve them the light palette with no error anywhere.
 *
 * It holds NO React state, deliberately. The resolved theme already exists in
 * exactly one place — the attribute — and both icons ship in the markup with
 * CSS choosing between them. Mirroring that into `useState` would mean an
 * effect that reads the DOM and sets state on mount: a cascading render, a
 * hydration mismatch to suppress, and a second source of truth.
 */
export function ThemeToggle({ label }: { label: string }) {
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing denies localStorage. The toggle still works for this
      // page view, it just is not remembered. Throwing here would take the
      // theme switch down entirely, which is the worse outcome.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="tap grid h-9 w-9 place-items-center rounded-(--radius-step-sm) border border-rule text-ink-2 transition-colors hover:border-gold hover:text-ink"
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="theme-icon-light h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <circle cx="10" cy="10" r="3.4" />
        <path d="M10 2.2v1.6M10 16.2v1.6M17.8 10h-1.6M3.8 10H2.2M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1M15.5 15.5l-1.1-1.1M5.6 5.6 4.5 4.5" />
      </svg>
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="theme-icon-dark h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" />
      </svg>
    </button>
  );
}

/**
 * Runs before first paint, inline in <head>. A fetched script can resolve
 * after paint, which is the light flash this exists to prevent — and here it
 * is also what makes the OS preference work at all, since the shared sheet
 * only ever looks at the attribute.
 */
export const THEME_BOOTSTRAP = `(function(){var d=document.documentElement;var t=null;try{t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.dataset.theme=t})()`;
