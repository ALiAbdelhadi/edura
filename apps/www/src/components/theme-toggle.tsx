"use client";

const STORAGE_KEY = "linktich-v2-theme";

export function ThemeToggle({ label }: { label: string }) {
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
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

export const THEME_BOOTSTRAP = `(function(){var d=document.documentElement;var t=null;try{t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.dataset.theme=t})()`;
