"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/command";
import { matchesSearchTerms, searchTerms } from "@repo/shared/search-text";
import { formatEGP, type Locale } from "@repo/ui/lib/format";
import * as React from "react";

export type PaletteItem = {
  href: string;
  label: string;
  translated: string;
  icon: React.ReactNode;
  badge?: number;
};

export type PaletteGroup = {
  heading: string;
  items: PaletteItem[];
};

export type PaletteRecord = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  badge?: string;
  amount?: number;
  href: string;
  masked?: boolean;
};

export type PaletteRecordGroup = {
  kind: string;
  heading: string;
  hits: PaletteRecord[];
};

export type PaletteRemote = {
  loading: boolean;
  groups: PaletteRecordGroup[];
  truncated: boolean;
  error?: string;
};

export type PaletteStrings = {
  title: string;
  placeholder: string;
  empty: string;
  fallbackHeading: string;
  destinationsHeading: string;
  searching: string;
  truncated: string;
  masked: string;
};

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
  locale: Locale;
  query: string;
  onQueryChange: (q: string) => void;
  remote?: PaletteRemote;
}) {
  const navGroups = React.useMemo(
    () => filterNavGroups(groups, query),
    [groups, query],
  );

  const recordGroups = remote?.groups ?? [];
  const hasRecords = recordGroups.some((g) => g.hits.length > 0);
  const hasNav = navGroups.some((g) => g.items.length > 0);

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
        {!hasNav && !hasRecords && !remote?.loading && !remote?.error ? (
          <CommandEmpty>{strings.empty}</CommandEmpty>
        ) : null}

        {navGroups
          .filter((g) => g.items.length > 0)
          .map((group, gi) => (
            <CommandGroup
              key={group.heading || `g${gi}`}
              heading={
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

        {remote?.error && !remote.loading ? (
          <div
            role="alert"
            className="px-4 py-2.5 text-[12px] text-red"
            aria-live="polite"
          >
            {remote.error}
          </div>
        ) : remote?.loading || remote?.truncated ? (
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

export function filterNavGroups(
  groups: PaletteGroup[],
  query: string,
): PaletteGroup[] {
  const terms = searchTerms(query);
  if (!terms.length) return groups;
  return groups.map((group) => ({
    heading: group.heading,
    items: group.items.filter((item) =>
      matchesSearchTerms([item.translated, item.label, item.href], terms),
    ),
  }));
}

export {
  CommandPaletteTrigger,
  useCommandPalette,
  usePaletteShortcutLabel,
} from "@repo/ui/components/nav-command-palette-trigger";
