"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { MoreHorizontal } from "lucide-react"

import { cn } from "@repo/ui/lib/utils"
import { Num } from "@repo/ui/components/num"

/**
 * الدفتر / The Ledger — bottom navigation (phone chrome).
 *
 * For student, parent and center staff — the three portals actually used on a
 * phone. Same three-group logic as the sidebar, collapsed to 4–5 destinations
 * with the remainder behind a "more" entry.
 *
 * Active state is the indigo bar ROTATED ABOVE the item — the same 3px rule
 * that marks a selected table row, turned 90°. One emphasis device, used
 * consistently, rather than a second one invented for phones.
 *
 * Count badges carry TEXT, never a bare `aria-hidden` dot: the audit found a
 * pending-registrations dot with no text equivalent, which is invisible to a
 * screen reader and ambiguous to everyone else.
 */

export interface BottomNavItem {
  href: string
  label: React.ReactNode
  icon: LucideIcon
  /** Unread/pending count. Rendered mono with an accessible name. */
  count?: number
  /** Localized description of what `count` counts, for assistive tech. */
  countLabel?: string
}

export interface BottomNavProps {
  items: BottomNavItem[]
  /** Current pathname; the item whose href matches is active. */
  activeHref?: string
  /** Localized "More". Shown when items exceed `max`, or when `showMore`. */
  moreLabel?: React.ReactNode
  onMore?: () => void
  /** Destinations before "more" takes over. 4 or 5. */
  max?: number
  /**
   * Force the "more" entry even when `items` fits. The caller usually knows
   * about destinations it chose NOT to pass here — this component only sees
   * its own list, so it cannot infer that on its own. Without this, a portal
   * surfacing 4 of 13 destinations renders no "more" and the other 9 become
   * reachable only through the sidebar toggle.
   */
  showMore?: boolean
  className?: string
}

function BottomNav({
  items,
  activeHref,
  moreLabel = "More",
  onMore,
  max = 5,
  showMore = false,
  className,
}: BottomNavProps) {
  const overflow = showMore || items.length > max
  const visible =
    items.length > max ? items.slice(0, max - 1) : items

  return (
    <nav
      data-slot="bottom-nav"
      className={cn(
        "sticky bottom-0 z-30 flex border-t border-rule bg-sheet",
        "pb-[env(safe-area-inset-bottom)] md:hidden",
        className,
      )}
    >
      {visible.map((item) => {
        const active = item.href === activeHref
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 px-1 py-2",
              active ? "text-indigo" : "text-ink-2",
            )}
          >
            {/* The selected-row rule, rotated above the item. */}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-3 top-0 h-[3px] rounded-b-[2px] bg-indigo"
              />
            ) : null}
            <span className="relative">
              <item.icon className="size-5" />
              {item.count ? (
                <Num
                  aria-label={item.countLabel}
                  className="absolute -end-2 -top-1.5 rounded-[5px] bg-amber-soft px-1 text-[10px] font-semibold text-amber"
                >
                  {item.count}
                </Num>
              ) : null}
            </span>
            <span className="truncate text-[11px] leading-none font-medium">
              {item.label}
            </span>
          </a>
        )
      })}
      {overflow ? (
        <button
          type="button"
          onClick={onMore}
          className="flex min-h-12 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-ink-2"
        >
          <MoreHorizontal className="size-5" />
          <span className="truncate text-[11px] leading-none font-medium">
            {moreLabel}
          </span>
        </button>
      ) : null}
    </nav>
  )
}

export { BottomNav }
