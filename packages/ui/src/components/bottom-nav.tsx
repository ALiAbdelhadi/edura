"use client";

// Bottom navigation — phone chrome for the student, parent and staff portals.
//
// It is the sidebar's logic on a different axis, not a second navigation
// system: the same destinations, the same grouping, the same active device —
// the sidebar's 3px `--indigo` bar, ROTATED from the inline-start edge onto the
// top edge, because the axis the item sits on has turned. Collapsed to at most
// `maxVisible` destinations with the remainder behind a "more" sheet, so the
// bar never scrolls sideways and never shrinks a target below thumb size.
//
// ── API notes, because three portal sessions build against this ─────────────
//
// `packages/ui` has no `next/` import anywhere and must keep it that way, so
// the link element is INJECTED via `linkAs` rather than imported. Pass
// `next/link` from an app; the default `"a"` keeps the component usable in
// isolation (tests, storybook, the superadmin app).
//
// Nothing here is translated. Every user-visible string arrives already
// localized, including the accessible badge text — this package has no i18n
// and adding one would give it an opinion about routing and locale that the
// consuming apps already hold.
//
// `group` is optional. Portals whose nav is still flat pass no groups and get
// a flat "more" sheet; portals that have adopted the three-group sidebar pass
// groups and get a grouped one. Both work without changing this file, which is
// the bar a shared component has to clear.

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
  /** Stable identity. Also what `activeKey` is compared against. */
  key: string;
  href: string;
  /** Already localized. */
  label: string;
  icon: React.ReactNode;
  /**
   * A count. Rendered as a mono chip with a real accessible name — never a
   * bare `aria-hidden` dot, which is the defect the audit found on the
   * pending-registrations indicator.
   */
  badge?: number;
  /** Already localized, e.g. "3 unread". Used as the item's accessible name. */
  badgeLabel?: string;
  /** Optional group label (already localized) for the overflow sheet. */
  group?: string;
  /**
   * Optional `data-tour` id, so a guided tour can point at this destination on
   * phones. Opt-in and inert. It must NOT be the same id the sidebar uses for
   * the same destination: both navigations are in the DOM at once (this bar is
   * `md:hidden`, the sidebar hides below `md`), so a shared id would be
   * ambiguous and could resolve to the hidden one.
   */
  tour?: string;
};

const BAR_HEIGHT = 60;

/**
 * Decide which destinations get a slot in the bar and which go behind "more".
 *
 * Exported and pure so it can be proven rather than eyeballed — three portals
 * depend on it, and its one subtle rule is easy to regress: **the active
 * destination is always reachable in one press.** If it would land in the
 * overflow, it is promoted into the last visible slot and the item it displaces
 * moves to the overflow. Otherwise a user on, say, Settings sees a bar that
 * does not admit the screen they are looking at exists.
 *
 * Invariants (asserted in bottom-nav-slots.test.ts):
 *   · slots ∪ overflow is exactly `items`, with no duplicates and none lost
 *   · slots.length <= maxVisible, leaving a slot for "more" when overflowing
 *   · if activeKey names an item, that item is in slots
 */
export function computeSlots<T extends { key: string }>(
  items: T[],
  maxVisible: number,
  activeKey?: string,
  /**
   * The "more" slot is drawn even when nothing overflows, so it has to be paid
   * for out of the same `maxVisible` slots. Set when the sheet carries
   * something that is not a destination — today, the account action: without
   * this the bar would draw `maxVisible` destinations AND a "more" beside them,
   * one target more than the width was designed for.
   */
  reserveMoreSlot = false,
): { slots: T[]; overflow: T[] } {
  if (!reserveMoreSlot && items.length <= maxVisible) {
    return { slots: items, overflow: [] };
  }

  // One slot is spent on "more", so only maxVisible-1 destinations show.
  const visible = items.slice(0, maxVisible - 1);
  const rest = items.slice(maxVisible - 1);

  const promoted = rest.find((i) => i.key === activeKey);
  // `visible` is empty at maxVisible <= 1: the single slot is spent on "more",
  // so there is nothing to promote INTO and nothing to displace. Without this
  // guard `displaced` is undefined and gets pushed into the overflow, which
  // then throws on render.
  if (!promoted || visible.length === 0) {
    return { slots: visible, overflow: rest };
  }

  const displaced = visible[visible.length - 1]!;
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
  /** Total slots in the bar, "more" included. 4–5 is the designed range. */
  maxVisible?: number;
  /** Already localized, e.g. «المزيد». */
  moreLabel: string;
  moreTitle: string;
  moreDescription?: string;
  /** Already localized accessible name for the <nav>. */
  navLabel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  linkAs?: React.ElementType<any>;
  /** Optional `data-tour` id for the "more" trigger. */
  moreTour?: string;
  /**
   * WHO YOU ARE, AND THE WAY OUT — the one thing in this sheet that is not a
   * destination.
   *
   * It exists because a portal that ships this bar HIDES the sidebar toggle on
   * phones (one navigation per viewport), and the sidebar is where identity and
   * logout live. So on a phone those two were in the DOM and unreachable: the
   * drawer holding them had no way to be opened. This is the other end of that
   * rule — if the bar takes the sidebar's place, it inherits the sidebar's
   * whole job, not just the destinations.
   *
   * Everything here is already localized, like every other string in this file.
   */
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
  // A count that is hidden behind "more" is a count nobody sees. Roll the
  // overflow's badges up onto the entry that conceals them, so an unread
  // notification is still visible when notifications did not make the bar.
  const moreBadge = hidden.reduce((sum, i) => sum + (i.badge ?? 0), 0);

  return (
    <>
      {/* Spacer: the bar is fixed, so without this the last row of content
          sits underneath it. Rendered by the component so a consumer cannot
          forget it. */}
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

          {/* `|| account`: the sheet is the only way to the account action, so
              its trigger cannot depend on whether the DESTINATIONS happened to
              overflow. A portal that later drops to four screens would
              otherwise lose its logout without a single line of it changing. */}
          {hidden.length > 0 || account ? (
            <li className="min-w-0 flex-1">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    data-tour={moreTour}
                    aria-haspopup="dialog"
                    // The rolled-up count is aria-hidden as a visual chip, so
                    // it has to reach the accessible name here or it is
                    // invisible to a screen reader. Same shape the header bell
                    // already uses.
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
                      // Below the destinations and behind a rule, because it is
                      // a different KIND of thing: everything above navigates,
                      // this ends the session. Same order as the sidebar, where
                      // identity sits under the nav and behind its own border.
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
      aria-current={active ? "page" : undefined}
      aria-label={item.badgeLabel}
      data-tour={item.tour}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 px-1 py-2",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo",
        active ? "text-indigo" : "text-ink-2",
      )}
      // 48px is the floor for a touch target; 60 gives icon + label room.
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

/**
 * The sidebar's active bar, rotated.
 *
 * In the sidebar it is 3px on the inline-start edge. Here the item sits on a
 * horizontal axis, so the same bar sits across the top. It is the top edge in
 * both directions — a horizontal rule has no start or end to mirror — so no
 * RTL flip is needed or wanted.
 */
function ActiveBar({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <span
      aria-hidden
      className="absolute start-0 end-0 top-0 h-[3px] bg-indigo"
    />
  );
}

/** Mono count chip. Amber on amber-soft: a count is something WAITING. */
function Badge({ count, floating }: { count?: number; floating?: boolean }) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "num rounded-[5px] bg-amber-soft px-1.5 text-[11px] font-semibold text-amber",
        // `-end-*` is logical, so the chip hangs off the icon's trailing edge
        // in both directions without a mirrored rule or a transform.
        floating && "absolute -top-2 -end-3 leading-tight",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
