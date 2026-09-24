"use client";

import { Kbd } from "@repo/ui/components/kbd";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

// The always-present half of the command palette: the ⌘K binding and the
// header button. Split from nav-command-palette.tsx so the portal shell can
// load these eagerly without also shipping cmdk, which only the dialog needs.
// Must not import from ./nav-command-palette or ./command.

export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}

export function usePaletteShortcutLabel(): string {
  const [isMac, setIsMac] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return isMac === null ? "" : isMac ? "⌘K" : "Ctrl K";
}

export function CommandPaletteTrigger({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  const shortcut = usePaletteShortcutLabel();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "group flex h-9 items-center gap-2 rounded-(--chrome-radius-full) border border-(--chrome-border) bg-(--chrome-surface-2) px-3 text-(--chrome-fg-muted)",
        "transition-[color,border-color] duration-(--chrome-fast) ease-(--chrome-ease)",
        "hover:border-(--chrome-fg-subtle) hover:text-(--chrome-fg)",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--chrome-ring)",
        className,
      )}
    >
      <SearchGlyph />
      <span className="hidden text-[13px] lg:inline">{label}</span>
      <Kbd className="hidden min-w-11 justify-center lg:inline-flex">
        {shortcut}
      </Kbd>
    </button>
  );
}

function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="size-4 shrink-0"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
