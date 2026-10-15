"use client";

import * as React from "react";
import { LogOut, MoreHorizontal } from "lucide-react";

import { cn } from "@repo/ui/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";

export type BottomNavItem = {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  badgeLabel?: string;
  group?: string;
  tour?: string;
};

const BAR_HEIGHT = 60;

export function computeSlots<T extends { key: string }>(
  items: T[],
  maxVisible: number,
  activeKey?: string,
  reserveMoreSlot = false,
): { slots: T[]; overflow: T[] } {
  if (!reserveMoreSlot && items.length <= maxVisible) {
    return { slots: items, overflow: [] };
  }

  const visible = items.slice(0, maxVisible - 1);
  const rest = items.slice(maxVisible - 1);

  const promoted = rest.find((i) => i.key === activeKey);
  if (!promoted || visible.length === 0) {
    return { slots: visible, overflow: rest };
  }

  const displaced = visible.at(-1)!;
  return {
    slots: [...visible.slice(0, -1), promoted],
    overflow: [...rest.filter((i) => i.key !== promoted.key), displaced],
  };
}

export function BottomNav({
  items,
  activeKey,
  maxVisible = 5,
  moreLabel,
  moreTitle,
  moreDescription,
  navLabel,
  linkAs: Link = "a",
  moreTour,
  account,
  className,
}: {
  items: BottomNavItem[];
  activeKey?: string;
  maxVisible?: number;
  moreLabel: string;
  moreTitle: string;
  moreDescription?: string;
  navLabel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  linkAs?: React.ElementType<any>;
  moreTour?: string;
  account?: {
    displayName: string;
    roleLabel: string;
    logoutLabel: string;
    onLogout: () => void;
  };
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const { slots, overflow: hidden } = React.useMemo(
    () => computeSlots(items, maxVisible, activeKey, Boolean(account)),
    [items, maxVisible, activeKey, account],
  );

  const grouped = React.useMemo(() => {
    const out = new Map<string, BottomNavItem[]>();
    for (const item of hidden) {
      const key = item.group ?? "";
      const bucket = out.get(key);
      if (bucket) bucket.push(item);
      else out.set(key, [item]);
    }
    return [...out.entries()];
  }, [hidden]);

  const moreActive = hidden.some((i) => i.key === activeKey);
  const moreBadge = hidden.reduce((sum, i) => sum + (i.badge ?? 0), 0);

  return (
    <>
      <div
        aria-hidden
        className="md:hidden"
        style={{
          height: `calc(${BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
        }}
      />
      <nav
        aria-label={navLabel}
        className={cn(
          "fixed start-0 end-0 bottom-0 z-40 md:hidden",
          "border-t border-rule bg-sheet",
          className,
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="flex items-stretch">
          {slots.map((item) => (
            <li key={item.key} className="min-w-0 flex-1">
              <BottomNavLink
                as={Link}
                item={item}
                active={item.key === activeKey}
              />
            </li>
          ))}

          {hidden.length > 0 || account ? (
            <li className="min-w-0 flex-1">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    data-tour={moreTour}
                    aria-haspopup="dialog"
                    aria-label={
                      moreBadge > 0 ? `${moreLabel} (${moreBadge})` : undefined
                    }
                    className={cn(
                      "relative flex w-full flex-col items-center justify-center gap-1 px-1 py-2",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo",
                      moreActive ? "text-indigo" : "text-ink-2",
                    )}
                    style={{ minHeight: BAR_HEIGHT }}
                  >
                    <ActiveBar shown={moreActive} />
                    <span aria-hidden className="relative">
                      <MoreHorizontal className="size-5" />
                      <Badge count={moreBadge} floating />
                    </span>
                    <span
                      className={cn(
                        "max-w-full truncate text-[11px]",
                        moreActive && "font-semibold",
                      )}
                    >
                      {moreLabel}
                    </span>
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="max-h-[70svh] overflow-y-auto"
                >
                  <SheetHeader>
                    <SheetTitle>{moreTitle}</SheetTitle>
                    {moreDescription ? (
                      <SheetDescription>{moreDescription}</SheetDescription>
                    ) : null}
                  </SheetHeader>
                  <div className="flex flex-col gap-4 px-4 pb-6">
                    {grouped.map(([group, groupItems]) => (
                      <div key={group} className="flex flex-col gap-1">
                        {group ? (
                          <span className="eyebrow px-2 pt-2">{group}</span>
                        ) : null}
                        {groupItems.map((item) => (
                          <Link
                            key={item.key}
                            href={item.href}
                            prefetch={false}
                            onClick={() => setOpen(false)}
                            aria-current={
                              item.key === activeKey ? "page" : undefined
                            }
                            aria-label={item.badgeLabel}
                            className={cn(
                              "flex items-center gap-3 rounded-md px-2 py-3 text-[14px]",
                              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
                              item.key === activeKey
                                ? "bg-indigo-soft font-semibold text-indigo"
                                : "text-ink-2 hover:bg-rule-2",
                            )}
                            style={{ minHeight: 48 }}
                          >
                            <span aria-hidden className="shrink-0">
                              {item.icon}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {item.label}
                            </span>
                            <Badge count={item.badge} />
                          </Link>
                        ))}
                      </div>
                    ))}

                    {account ? (
                      <div className="flex flex-col gap-1 border-t border-rule pt-3">
                        <div className="min-w-0 px-2">
                          <p className="truncate text-[14px] font-semibold text-ink">
                            {account.displayName}
                          </p>
                          <p className="truncate text-[12px] text-ink-2">
                            {account.roleLabel}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            account.onLogout();
                          }}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-2 py-3 text-start text-[14px] text-destructive",
                            "hover:bg-destructive/10",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
                          )}
                          style={{ minHeight: 48 }}
                        >
                          <LogOut aria-hidden className="size-5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">
                            {account.logoutLabel}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </SheetContent>
              </Sheet>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
}

function BottomNavLink({
  as: Link,
  item,
  active,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  as: React.ElementType<any>;
  item: BottomNavItem;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      aria-label={item.badgeLabel}
      data-tour={item.tour}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 px-1 py-2",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo",
        active ? "text-indigo" : "text-ink-2",
      )}
      style={{ minHeight: BAR_HEIGHT }}
    >
      <ActiveBar shown={active} />
      <span aria-hidden className="relative">
        {item.icon}
        <Badge count={item.badge} floating />
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[11px]",
          active && "font-semibold",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

function ActiveBar({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <span
      aria-hidden
      className="absolute start-0 end-0 top-0 h-[3px] bg-indigo"
    />
  );
}

function Badge({ count, floating }: { count?: number; floating?: boolean }) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "num rounded-[5px] bg-amber-soft px-1.5 text-[11px] font-semibold text-amber",
        floating && "absolute -top-2 -end-3 leading-tight",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
