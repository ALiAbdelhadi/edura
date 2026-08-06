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
