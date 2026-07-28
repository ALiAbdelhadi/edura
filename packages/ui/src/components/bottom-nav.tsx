"use client";

import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

/* <BottomNav> — phone chrome for student, parent and staff.
   ══════════════════════════════════════════════════════════════════════════════

   A sidebar is desktop furniture. On a 390px screen it is a drawer the user must open
   before they can navigate, which on the three portals whose users are MOSTLY on
   phones is the wrong default.

   Same three-group logic as the sidebar, collapsed to 4–5 primary destinations with
   the remainder behind a "more" entry — the groups still exist, they are just not all
   visible at once.

   The active state is the SIDEBAR'S INDIGO BAR ROTATED ABOVE THE ITEM. Deliberately
   the same element, not a new one: a user who learns "the indigo bar marks where I am"
   on desktop should not have to learn a second idiom on their phone. */

export type BottomNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Count badge. Text, never a bare dot — a dot has no screen-reader equivalent. */
  badge?: number;
};

export function BottomNav({
  items,
  activeHref,
  moreLabel,
  onMore,
  className,
  renderLink,
}: {
  items: BottomNavItem[];
  activeHref?: string;
  moreLabel?: string;
  onMore?: () => void;
  className?: string;
  /** The app supplies its router Link; @repo/ui must not depend on next/link. */
  renderLink?: (props: {
    href: string;
    className: string;
    children: React.ReactNode;
    "aria-current"?: "page";
  }) => React.ReactNode;
}) {
  const itemClass = (active: boolean) =>
    cn(
      // 48px minimum target: this is a thumb surface, the same floor as `touch` density.
      "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1 text-[11px] font-medium",
      active ? "text-indigo" : "text-ink-2",
    );

  return (
    <nav
      className={cn(
        "sticky bottom-0 z-30 flex items-stretch border-t border-rule bg-sheet",
        "pb-[env(safe-area-inset-bottom)] md:hidden",
        className,
      )}
      aria-label={moreLabel ? undefined : "Primary"}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        const inner = (
          <>
            {/* The sidebar's 3px indigo bar, rotated to sit above the item. */}
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-indigo"
              />
            ) : null}
            <span className="relative">
              <item.icon className="size-5" aria-hidden="true" />
              {item.badge ? (
                <span className="num absolute -end-2 -top-1.5 rounded-[5px] bg-amber-soft px-1 text-[10px] font-semibold text-amber">
                  {item.badge}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate">{item.label}</span>
          </>
        );
        const props = {
          href: item.href,
          className: itemClass(active),
          children: inner,
          ...(active ? { "aria-current": "page" as const } : {}),
        };
        return (
          <React.Fragment key={item.href}>
            {renderLink ? renderLink(props) : <a {...props} />}
          </React.Fragment>
        );
      })}
      {onMore ? (
        <button type="button" onClick={onMore} className={itemClass(false)}>
          <span className="flex size-5 items-center justify-center" aria-hidden="true">
            ⋯
          </span>
          <span className="truncate">{moreLabel}</span>
        </button>
      ) : null}
    </nav>
  );
}
