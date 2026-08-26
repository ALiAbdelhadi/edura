/* Day BOUNDS — the pair of instants a `from`/`to` filter actually means.
   ══════════════════════════════════════════════════════════════════════════════

   Sibling of `date-key.ts`. That module answers "which calendar day is this?"
   and returns a YYYY-MM-DD string. This one answers the query-building question
   underneath it: given the day the operator picked, WHICH INSTANTS bound it?

   THE DAY IS A CAIRO DAY. Not the server's day, not UTC's. The counter has
   always resolved "today" through `todayKey()` / `PLATFORM_TIME_ZONE`
   (docs/decisions/counter-board.md #4) while the books resolved it through UTC,
   so the same cash could sit on two different days depending on which screen
   was asked. The full reasoning, and what is deliberately NOT on this clock, is
   in docs/decisions/money-day-boundary.md.

   It also exists because the two halves of ONE screen disagreed. On
   `/dashboard/admin/fees` a single `DateRangeField` drives both the P&L and the
   payment log beneath it; `reports.ts` bounded its range correctly while the
   log did `lte = new Date(filters.to)` — **00:00** on the `to` date — so every
   payment taken on the last day of the range was excluded. Two implementations
   of "what does `to` mean" is how that happens, so there is now one.

   This module imports only `date-key`, which imports nothing, so it is safe
   from a client component as well as from server code. */

import {
  endOfPlatformDay,
  platformDayKey,
  startOfPlatformDay,
  todayKey,
} from "./date-key";

export type DayRange = { gte?: Date; lte?: Date };

/**
 * The inclusive instant range a `from`/`to` pair of day strings denotes, on the
 * platform clock.
 *
 * Either end may be omitted — an open-ended range is a legitimate filter, and
 * `undefined` (rather than an empty object) comes back when BOTH are missing, so
 * a caller can spread it conditionally and add no `where` clause at all.
 *
 * The whole `to` day is included. That is half the point of the module; the
 * other half is that "the whole day" is measured in Cairo.
 *
 * SAFE ON DATE-ONLY COLUMNS TOO, which is not obvious and is why it is written
 * down. A `session.date` or a `grade.date` is anchored at midnight UTC, and a
 * Cairo day D spans `[D-1 21:00Z or 22:00Z, D 20:59:59.999Z or 21:59:59.999Z]`.
 * `D 00:00Z` falls inside that window; `D-1 00:00Z` and `D+1 00:00Z` fall
 * outside it. So one helper serves both kinds of column — but only because
 * Cairo is EAST of UTC. A platform timezone west of UTC would push the window
 * past midnight-UTC and start dropping date-only rows silently.
 */
export function dayRange(from?: string, to?: string): DayRange | undefined {
  if (!from && !to) return undefined;
  const range: DayRange = {};
  if (from) range.gte = startOfPlatformDay(platformDayKey(from));
  if (to) range.lte = endOfPlatformDay(platformDayKey(to));
  return range;
}

/**
 * The half-open window of the CURRENT Cairo day: `[start, nextStart)`.
 *
 * The "what is happening today" question, as opposed to "what did the operator
 * pick". Half-open because that is the shape the dashboards already used
 * (`gte` / `lt`), and because it composes: today's window ends exactly where
 * tomorrow's begins, with no millisecond in between belonging to neither.
 */
export function platformTodayWindow(now: Date = new Date()): { gte: Date; lt: Date } {
  const today = todayKey(now);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { gte: startOfPlatformDay(today), lt: startOfPlatformDay(tomorrow) };
}
