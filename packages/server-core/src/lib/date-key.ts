/* YYYY-MM-DD keys — the two kinds, kept apart on purpose.
   ══════════════════════════════════════════════════════════════════════════════

   `new Date().toISOString().slice(0, 10)` appeared 26 times across both apps and
   server-core. It was doing TWO different jobs, and it is only correct at one of
   them:

   1. FORMATTING A DATE THAT IS ALREADY A DATE. A `@db.Date` column, a
      `date_trunc` bucket, a session's `date` — Postgres hands these back anchored
      at midnight UTC, so reading the UTC calendar day off them is exactly right.
      That is `toDateKey`.

   2. ASKING WHAT DAY IT IS. `new Date()` is an instant, not a day, and the UTC
      calendar day is not the day the user is living in. Egypt runs UTC+2 (UTC+3
      on DST), so from midnight until 02:00/03:00 local, the UTC date is still
      YESTERDAY. Every "today" computed that way was wrong for those hours — the
      door check-in screen fetched the previous day's sessions, the audit
      screens' Today/Yesterday presets were off by one, and `isNotPastDate`
      accepted a start date that had already passed locally.
      That is `todayKey`.

   Both return the same shape, which is exactly why the bug was invisible. Naming
   them separately is the fix: at every call site you now have to say which
   question you are asking.

   This module imports nothing, so it is safe from a client component
   (`@repo/server-core/lib/date-key`) as well as from server code. */

/**
 * The business timezone. Every "what day is it for the user" answer resolves
 * here — the product is Egyptian and its centers, sessions and cut-offs run on
 * Cairo wall-clock, not on the server's location or the browser's.
 */
export const PLATFORM_TIME_ZONE = "Africa/Cairo";

/** `en-CA` is the locale whose short date format IS `YYYY-MM-DD`. */
const KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLATFORM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The calendar day a stored date-only value represents.
 *
 * Use for values that are already days: `@db.Date` columns, `date_trunc`
 * buckets, a session's `date`. Do NOT use it on a timestamp to ask what day it
 * is now — that is `todayKey`.
 */
export function toDateKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

/**
 * Today, on the platform's wall-clock.
 *
 * Pass `now` to resolve a different instant (e.g. `new Date(Date.now() - 86_400_000)`
 * for yesterday) — the timezone conversion still applies.
 */
export function todayKey(now: Date = new Date()): string {
  return KEY_FORMAT.format(now);
}

/**
 * The day a user PICKED in a calendar.
 *
 * The third case, and the one that bites hardest. A date picker hands back a
 * `Date` at LOCAL midnight — pick 2 August in Cairo and you get
 * `2026-08-01T22:00:00Z`. Running that through `toDateKey` reads the UTC day and
 * gives back 1 August: the filter silently queries the day before the one the
 * user clicked. Read the local fields instead, because local midnight is exactly
 * where the picker put them.
 */
export function pickedDateKey(picked: Date): string {
  const y = picked.getFullYear();
  const m = String(picked.getMonth() + 1).padStart(2, "0");
  const d = String(picked.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The inverse of `pickedDateKey`: a key back into the local-midnight `Date` a
 * calendar expects as its selection.
 *
 * Built from parts on purpose. `new Date("2026-08-02")` parses as midnight UTC,
 * so east of UTC the calendar would highlight 1 August for a key that says the
 * 2nd — the same off-by-one, arriving from the other direction.
 */
export function parseDateKey(key: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Day BOUNDS on the platform clock — the instants a Cairo calendar day spans.
//
// `todayKey` above answers "which day is it?". These answer the question the
// query builder actually asks: "which instants is that day made of?" They are
// what `lib/day-range` builds every money filter from — see
// docs/decisions/money-day-boundary.md for why the books moved onto the same
// clock the counter has always used.
// ─────────────────────────────────────────────────────────────────────────────

/** Cairo wall-clock parts of an instant. `h23` so midnight is 00, never 24. */
const PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLATFORM_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** How far ahead of UTC the platform clock is AT a given instant (DST-aware). */
function platformOffsetMs(instant: Date): number {
  const parts: Record<string, string> = {};
  for (const p of PARTS_FORMAT.formatToParts(instant)) parts[p.type] = p.value;
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  // Compare whole seconds: the formatter has no millisecond field, and every
  // real UTC offset is a whole number of minutes anyway.
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a given Cairo wall-clock time on a given day occurs.
 *
 * TWO PASSES, and the second one is not belt-and-braces. The offset is itself a
 * function of the instant, so the first guess uses the offset in force at the
 * WRONG moment — and on a DST boundary that is the other side of the change.
 * Re-resolving against the first guess lands it.
 *
 * Egypt's transitions are both handled by that, and both are checked in
 * `tests/unit/platform-day-bounds.test.ts` against real ICU data:
 *
 *   • DST STARTS at 00:00 (clocks jump to 01:00), so midnight that day DOES NOT
 *     EXIST. The pass resolves to 01:00 — the first instant the day actually
 *     has, which is what a start bound must be.
 *   • DST ENDS at 24:00 (clocks fall back to 23:00), so 23:00–23:59:59.999
 *     happens TWICE. The pass resolves to the SECOND occurrence, which is what
 *     an end bound must be if the last hour of trading is to be inside the day.
 */
function platformInstant(key: string, h: number, m: number, s: number, ms: number): Date {
  const y = Number(key.slice(0, 4));
  const mo = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  const wall = Date.UTC(y, mo - 1, d, h, m, s, ms);
  const guess = wall - platformOffsetMs(new Date(wall));
  return new Date(wall - platformOffsetMs(new Date(guess)));
}

/** First instant of the Cairo day `key` (`YYYY-MM-DD`). */
export function startOfPlatformDay(key: string): Date {
  return platformInstant(key, 0, 0, 0, 0);
}

/**
 * Last instant of the Cairo day `key`.
 *
 * `23:59:59.999`, so the filters built from it can be inclusive (`lte`) — the
 * shape every report range already used.
 */
export function endOfPlatformDay(key: string): Date {
  return platformInstant(key, 23, 59, 59, 999);
}

/**
 * The Cairo day a `from`/`to` filter value denotes, whatever shape it arrives in.
 *
 * A bare `YYYY-MM-DD` is a day the operator PICKED and is taken at its word — no
 * timezone maths, because there is no instant in it to convert. Anything else is
 * an instant, and the day it belongs to is the Cairo day it falls in.
 *
 * An unparseable value yields an unparseable key, which becomes an Invalid Date
 * downstream and fails loudly at the driver — the behaviour before this module
 * existed. A silently dropped filter would widen a money query instead.
 */
export function platformDayKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayKey(new Date(value));
}

/** The calendar day `days` away from `key`. Pure calendar arithmetic. */
export function shiftDayKey(key: string, days: number): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}
