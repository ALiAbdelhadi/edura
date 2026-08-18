"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/command";
import { Kbd } from "@repo/ui/components/kbd";
import { formatEGP, type Locale } from "@repo/ui/lib/format";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

export type PaletteItem = {
  href: string;
  /** The raw English nav label — the key, not the rendered string. */
  label: string;
  /** The label as the reader sees it, already translated. */
  translated: string;
  icon: React.ReactNode;
  badge?: number;
};

export type PaletteGroup = {
  /** Already translated. Empty string = the portal's own home, no heading. */
  heading: string;
  items: PaletteItem[];
};

/**
 * A RECORD, not a destination — a student, a group, a hall, a receipt.
 *
 * Deliberately a different type from `PaletteItem` rather than a widened one.
 * A destination is a fixed part of this role's portal, known before anyone
 * types; a record is a row that exists because a query matched it, and it
 * carries things a nav entry never has (a subtitle, an identifier, and the
 * possibility of being MASKED). Folding them into one type would have made
 * every field optional and every render site guess which kind it was holding.
 */
export type PaletteRecord = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  badge?: string;
  /** Signed PIASTERS. Formatted HERE, where the locale is. */
  amount?: number;
  href: string;
  masked?: boolean;
};

export type PaletteRecordGroup = {
  kind: string;
  /** Already translated — the caller owns the kind → label catalogue. */
  heading: string;
  hits: PaletteRecord[];
};

export type PaletteRemote = {
  /** In flight for the CURRENT query. Drives the header line, not a blank list. */
  loading: boolean;
  groups: PaletteRecordGroup[];
  /** At least one group hit its cap — the reader is told to keep typing. */
  truncated: boolean;
};

export type PaletteStrings = {
  title: string;
  placeholder: string;
  empty: string;
  /** Heading for the run of items that has no group of its own. */
  fallbackHeading: string;
  /** Heading over the destination results once records are in the list too. */
  destinationsHeading: string;
  /** "Searching…" — shown while a remote query is in flight. */
  searching: string;
  /** "Keep typing to narrow this down." */
  truncated: string;
  /** Screen-reader-only marker on a redacted record. */
  masked: string;
};

/**
 * The command palette — ⌘K over everything THIS ROLE HOLDS.
 *
 * WHY IT EXISTS. The longest menu in the product (center admin) carries six
 * labelled groups; the back office carries twenty-one destinations. Above about
 * a dozen, a menu stops being scanned and starts being hunted through, and the
 * hunt costs the same every single time because nothing about it improves with
 * familiarity. A palette is the affordance that does improve: the tenth time
 * you want the counter you type two letters instead of reading six headings.
 *
 * IT ANSWERS TWO QUESTIONS, AND THEY ARE NOT THE SAME ONE.
 *   "Where is the counter?"  → a DESTINATION. Known up front, matched locally,
 *                              answered before the key repeats.
 *   "Where is Mariam?"       → a RECORD. Only the server knows, so it arrives
 *                              a moment later, under its own heading.
 * Destinations are ALWAYS drawn first and are never displaced by a slow
 * network: an operator who typed two letters meaning "attendance" must not have
 * their selection move under them when a student list lands 200ms later.
 *
 * WHAT IT MAY LIST — and this is a constitution rule, not a preference.
 * `design/CONSTITUTION.md` §3: excluded capabilities are ABSENT from the screen,
 * never disabled. So the destination half is built from the caller's OWN nav
 * groups and has no catalogue of its own, and the record half is built by
 * providers that are skipped entirely when the role holds no screen for them.
 * Neither can offer something that would refuse on arrival.
 *
 * WHY IT SEARCHES BOTH SCRIPTS. Each destination is matched on its TRANSLATED
 * label AND its raw English key AND its href. An Egyptian receptionist works an
 * Arabic UI and types Latin faster than Arabic on a counter keyboard; requiring
 * the Arabic string would make the palette slower than the menu it replaces for
 * the person most likely to use it. Typing `wallet` finds «المحفظة».
 *
 * THE GROUPS ARE THE SIDEBAR'S GROUPS. A palette that flattened them into one
 * list would be a second information architecture for the same portal — the
 * thing the 2026-08-11 nav pass exists to prevent. Here it also teaches: the
 * heading beside a result is where that screen lives in the menu.
 *
 * FILTERING IS OURS, NOT cmdk's (`shouldFilter={false}`). Two reasons, and the
 * second is a correctness one: cmdk's fuzzy matcher would re-filter the
 * server's records against the raw query and silently drop a student found by
 * phone number whose NAME does not contain those digits — the server matched
 * them on a column the client cannot see. Owning the match also lets the
 * destination list stay grouped and ordered the way the sidebar is.
 */
export function NavCommandPalette({
  open,
  onOpenChange,
  groups,
  onSelect,
  strings,
  locale,
  query,
  onQueryChange,
  remote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: PaletteGroup[];
  onSelect: (href: string) => void;
  strings: PaletteStrings;
  /** Money in a record row is formatted against this, never on the server. */
  locale: Locale;
  /** Controlled so the shell can debounce it into a request. */
  query: string;
  onQueryChange: (q: string) => void;
  /** Absent = destinations only. That is the whole degradation path. */
  remote?: PaletteRemote;
}) {
  const navGroups = React.useMemo(
    () => filterNavGroups(groups, query),
    [groups, query],
  );

  const recordGroups = remote?.groups ?? [];
  const hasRecords = recordGroups.some((g) => g.hits.length > 0);
  const hasNav = navGroups.some((g) => g.items.length > 0);

  // Reset on close, not on open: clearing as it opens is visible as a flash of
  // the previous results, and a palette that reopens holding a stale query
  // would fire a request for something nobody asked for again.
  const handleOpenChange = (next: boolean) => {
    if (!next) onQueryChange("");
    onOpenChange(next);
  };

  const go = (href: string) => {
    onOpenChange(false);
    onQueryChange("");
    onSelect(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={strings.title}
      description={strings.placeholder}
      className="chrome-surface"
      shouldFilter={false}
    >
      <CommandInput
        placeholder={strings.placeholder}
        value={query}
        onValueChange={onQueryChange}
      />
      <CommandList className="max-h-[min(28rem,60svh)]">
        {/* The empty state must not appear while an answer is still coming —
            "no results" followed by results is the palette telling the reader
            something untrue, briefly, on every single search. */}
        {!hasNav && !hasRecords && !remote?.loading ? (
          <CommandEmpty>{strings.empty}</CommandEmpty>
        ) : null}

        {navGroups
          .filter((g) => g.items.length > 0)
          .map((group, gi) => (
            <CommandGroup
              key={group.heading || `g${gi}`}
              heading={
                // Records in the list turn "Overview" into an ambiguous
                // heading, so the head group takes an explicit one only then.
                group.heading ||
                (hasRecords
                  ? strings.destinationsHeading
                  : strings.fallbackHeading)
              }
            >
              {group.items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`nav:${item.href}`}
                  onSelect={() => go(item.href)}
                  className="gap-3"
                >
                  <span className="text-(--chrome-fg-muted)">{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {item.translated}
                  </span>
                  {item.badge ? <CountChip>{item.badge}</CountChip> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

        {recordGroups
          .filter((g) => g.hits.length > 0)
          .map((group) => (
            <CommandGroup key={`k:${group.kind}`} heading={group.heading}>
              {group.hits.map((hit) => (
                <CommandItem
                  key={`${group.kind}:${hit.id}`}
                  value={`rec:${group.kind}:${hit.id}`}
                  onSelect={() => go(hit.href)}
                  className="gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{hit.title}</span>
                      {hit.masked ? (
                        <span className="sr-only">{strings.masked}</span>
                      ) : null}
                    </span>
                    {hit.subtitle || hit.amount !== undefined ? (
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-(--chrome-fg-muted)">
                        {hit.amount !== undefined ? (
                          // Money is a figure: mono, tabular and bidi-isolated,
                          // the `<Num>` treatment from constitution §6.3.
                          <span
                            dir="ltr"
                            className="shrink-0 font-(family-name:--chrome-mono) tabular-nums"
                          >
                            {formatEGP(hit.amount, locale, { decimals: true })}
                          </span>
                        ) : null}
                        {hit.subtitle ? (
                          <span className="truncate">{hit.subtitle}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  {hit.badge ? <CodeChip>{hit.badge}</CodeChip> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

        {remote?.loading || remote?.truncated ? (
          <div
            className="px-4 py-2.5 text-[12px] text-(--chrome-fg-muted)"
            aria-live="polite"
          >
            {remote.loading ? strings.searching : strings.truncated}
          </div>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Latin digits, mono, tabular, bidi-isolated — the `<Num>` path from
 * constitution §6.3. Arabic-Indic digits in a counter would fall back silently
 * out of the mono face.
 */
function CountChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      dir="ltr"
      className="shrink-0 rounded-(--chrome-radius-sm) bg-(--chrome-accent-soft) px-1.5 py-0.5 font-(family-name:--chrome-mono) text-[11px] font-semibold text-(--chrome-accent-text) tabular-nums"
    >
      {children}
    </span>
  );
}

/** A student code or a receipt number: an identifier, so mono and LTR too. */
function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      dir="ltr"
      className="shrink-0 rounded-(--chrome-radius-sm) border border-(--chrome-border) px-1.5 py-0.5 font-(family-name:--chrome-mono) text-[11px] text-(--chrome-fg-muted) tabular-nums"
    >
      {children}
    </span>
  );
}

/**
 * The destination matcher, exported because it is the only piece of this file
 * that can be asserted without a browser.
 *
 * A SUBSTRING MATCH, NOT A FUZZY ONE. cmdk's default scorer accepts `wlt` for
 * "wallet", which is a lovely trick on a developer's palette and a liability on
 * a counter: it also accepts `sett` for BOTH "Settings" and "Settlements", and
 * ranks them by an opaque score. A receptionist typing three letters under
 * pressure needs the list to be predictable, not clever.
 */
export function filterNavGroups(
  groups: PaletteGroup[],
  query: string,
): PaletteGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups.map((group) => ({
    heading: group.heading,
    items: group.items.filter((item) =>
      `${item.translated} ${item.label} ${item.href}`.toLowerCase().includes(q),
    ),
  }));
}

/**
 * ⌘K / Ctrl+K. Deliberately NOT ⌘B — `SidebarProvider` already owns that for
 * collapsing the rail, and stealing it would trade one affordance for another.
 */
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

/**
 * The header trigger. It shows the shortcut rather than hiding it: a keyboard
 * affordance nobody is told about is one only its author uses, and this palette
 * is worth more to the operator who lives in one portal all day than to anyone
 * who discovers it by accident.
 */
export function CommandPaletteTrigger({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  // Rendered only after mount: the symbol differs per platform, and deciding it
  // on the server would ship ⌘ to a Windows receptionist half the time.
  const [isMac, setIsMac] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

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
      {/* `min-w` so the Ctrl/⌘ swap after mount cannot shift the header. */}
      <Kbd className="hidden min-w-11 justify-center lg:inline-flex">
        {isMac === null ? "" : isMac ? "⌘K" : "Ctrl K"}
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
