/**
 * ONE derivation of "which lesson is next", and of "which day is a lesson on".
 *
 * Shared by both portals. It was written for the student pass and lived in
 * features/student; nothing in it is student-specific — it reads dated rows and
 * sorts them — and the parent home asks the identical question about a child's
 * next lesson, off the identical `sessions` resource. A copy in the parent
 * folder would be a second answer to the question this module exists to answer
 * once.
 *
 * The home hero and the schedule screen both have to answer those two
 * questions, and before this module they answered them differently: the hero
 * took `todaySchedule[0]` from `dashboards/student` (a payload whose `room` and
 * `teacher` are the empty string by construction), while the schedule screen
 * matched `new Date(s.date).getDay()` against a weekday name — which matches
 * EVERY session ever held on that weekday, past ones included. Two answers to
 * one question is how a portal starts contradicting itself.
 *
 * ── WHY THE DATE IS SLICED AND NOT PARSED ─────────────────────────────────
 *
 * `Session.date` is a calendar day, and it arrives as an ISO instant pinned to
 * UTC midnight (`2026-08-20T00:00:00.000Z`). Reading it back through `new Date`
 * and then asking for the LOCAL day is only safe east of Greenwich; the product
 * is Egyptian (UTC+2/+3) so it happens to hold today, but it is a silent trap
 * for anyone who runs the app anywhere else. Taking the first ten characters
 * asks the string for the day it already states, and crosses no timezone at
 * all.
 *
 * The clock time is then applied ON THE CAIRO CLOCK — see `startsAt`. This
 * paragraph used to end "in the reader's own zone, which is where a wall-clock
 * lesson time belongs", and that sentence was the bug: it is the one place a
 * reader could have gone to check, and it told them the wrong thing with
 * confidence. A lesson's `HH:MM` belongs to the zone of the door the student
 * walks through, which is Cairo for every center this product has.
 */

// Safe from a client component: `date-key` imports nothing and says so.
import { platformInstant, shiftDayKey, todayKey } from "@repo/server-core/lib/date-key";

export type TimedSession = {
  date: string | Date;
  startTime?: string | null;
  status?: string | null;
};

/** Sessions a student can still attend. A cancelled lesson is not "next". */
const LIVE_STATUSES = new Set(["scheduled", "postponed"]);

/**
 * A lesson that began forty-five minutes ago is still the answer to "where am I
 * meant to be" — the student is in the room. Past that it is history, and the
 * hero should have moved on to the next one.
 */
const STILL_NOW_MS = 45 * 60 * 1000;

/**
 * The calendar day of a value that is ALREADY A DAY.
 *
 * ── THE TWO BRANCHES ANSWER DIFFERENT QUESTIONS ───────────────────────────
 *
 * This used to read, in full: "`2026-08-20` — the calendar day, never shifted
 * by a timezone." That is true of one branch and false of the other, and one
 * comment covering both is how a reader gets told the opposite of what happens.
 *
 *   STRING  `"2026-08-20T00:00:00.000Z".slice(0, 10)` — the day the string
 *           already states. Crosses no timezone, because no conversion occurs:
 *           there is nothing here but characters. Genuinely unshiftable, and
 *           this is the branch every caller in the app actually takes, since
 *           `Session.date` arrives from the API as an ISO string.
 *
 *   DATE    `getFullYear/getMonth/getDate` — the day in the DEVICE's zone.
 *           This one IS shifted, by the reader's offset. It is `pickedDateKey`
 *           semantics (see `date-key.ts`): correct for a `Date` that a calendar
 *           control produced at LOCAL midnight, wrong for an instant.
 *
 * ── WHAT MUST NOT BE PASSED ───────────────────────────────────────────────
 *
 * A `Date` that is a moment in time rather than a day — `new Date()` above all.
 * The `Date` branch would answer with the device's day, which is how a
 * `todayKey` returning `dateKeyOf(new Date())` came to live in this module and
 * disagree with the rest of the product for two hours a night. "What day is it
 * now" is `todayKey` in `@repo/server-core/lib/date-key`, and it is not
 * answerable here.
 *
 * Empty string for a missing value, so a half-built row sorts and compares as
 * "no day" instead of throwing inside a render.
 */
export function dateKeyOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* THERE IS NO `todayKey` IN THIS MODULE, and its absence is load-bearing.
   ──────────────────────────────────────────────────────────────────────────
   One lived here until 2026-08-27, returning `dateKeyOf(new Date())` — the
   DEVICE's calendar day. `@repo/server-core/lib/date-key` exports a function
   of the same name, the same signature and the same return shape that answers
   the CAIRO day, and the two disagreed for the two hours (three on DST)
   between Cairo midnight and a western device's. Nothing at either import site
   showed which one you had:

       import { todayKey } from "@repo/server-core/lib/date-key";   // Cairo
       import { todayKey } from "@/features/sessions/session-time";  // the device

   The center portal took the first, the student and parent portals the second,
   so the two halves of the product disagreed about what day it was and no
   symptom ever appeared in Cairo. Ask `date-key` — it is the only module that
   should answer "what day is it", and it holds the three answers (UTC day,
   picked day, platform day) separately on purpose. */

/** `2026-08-20` exactly — anything else is not a day and must not be arithmetic. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** `16:00`, and the leading anchor matters — `"6:00"` is not a wall-clock time. */
const CLOCK = /^(\d{2}):(\d{2})$/;

/**
 * The instant a session begins — on the CAIRO clock, not the reader's.
 *
 * ── WHY NOT `new Date(`${key}T${clock}:00`)` ──────────────────────────────
 *
 * That is what this did until 2026-08-27, and it is wrong everywhere except
 * Cairo. A zoneless ISO literal is parsed in the DEVICE's zone, so on a UTC
 * device `2026-08-20T16:00:00` becomes 16:00Z — 19:00 Cairo. The lesson is
 * treated as starting three hours after it really did, which is not a rounding
 * error: it is past the entire 45-minute STILL_NOW_MS window twice over.
 *
 * A `startTime` is a bare `HH:MM` and it means Cairo wall-clock, because that
 * is the clock the center's door runs on — `services/attendance/counter.ts`
 * says so, and the money engine has always agreed. The reader's zone never
 * entered into it; the old comment here ("in the reader's zone") described the
 * bug rather than the intent.
 *
 * `platformInstant` does the conversion DST included. There is no second
 * derivation of it in the app and there must not be one.
 *
 * ── WHAT AN UNUSABLE ROW GIVES BACK ───────────────────────────────────────
 *
 * `new Date(NaN)`, exactly as the string form did for a malformed literal. It
 * matters that this stays a value and not a throw: `platformInstant` would
 * reach `Intl.formatToParts`, which raises `RangeError` on an invalid date, and
 * one bad row out of a list would take down a whole portal screen. An Invalid
 * Date compares false against every bound instead, so the row simply never
 * shows as next, upcoming, or happening now.
 */
export function startsAt(session: TimedSession): Date {
  const key = dateKeyOf(session.date);
  const clock = CLOCK.exec(session.startTime || "00:00");
  if (!DAY_KEY.test(key) || !clock) return new Date(NaN);
  return platformInstant(key, Number(clock[1]), Number(clock[2]), 0, 0);
}

/** Ascending by the instant they begin. */
export function byStart(a: TimedSession, b: TimedSession): number {
  return startsAt(a).getTime() - startsAt(b).getTime();
}

/**
 * Every lesson still ahead of the reader, soonest first — the one list both
 * "up next" and "the rest of today" are taken from.
 */
export function upcomingSessions<T extends TimedSession>(
  sessions: T[],
  now: Date = new Date(),
): T[] {
  const floor = now.getTime() - STILL_NOW_MS;
  return sessions
    .filter((s) => LIVE_STATUSES.has(s.status ?? "scheduled"))
    .filter((s) => startsAt(s).getTime() >= floor)
    .sort(byStart);
}

/**
 * The seven calendar days of a week, as date keys.
 *
 * SUNDAY-FIRST, and not because that is universal — it is what the attendance
 * heatmap already draws (ح ن ث ر خ ج س), and a portal whose two calendars
 * disagreed about where a week starts would be worse than either choice.
 *
 * `offsetWeeks` moves whole weeks: -1 is last week, +1 is next.
 *
 * ANCHORED ON THE CAIRO DAY, like every other "what day is it" in the app.
 * This used to read `now.getFullYear()/getMonth()/getDate()` — the DEVICE's
 * day — and then walk the week with local `setDate` calls. West of Cairo, in
 * the hours after Cairo midnight, that returned the previous week's strip: the
 * highlighted "today" column was the wrong column, and on a Saturday the whole
 * week started a day early. The weekday of a calendar date is the same in every
 * zone once you have the date, so the arithmetic is pure calendar arithmetic
 * (`shiftDayKey`) and no second instant is constructed.
 */
export function weekDayKeys(now: Date = new Date(), offsetWeeks = 0): string[] {
  const key = todayKey(now);
  const dow = new Date(
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))),
  ).getUTCDay();
  const start = shiftDayKey(key, offsetWeeks * 7 - dow);
  return Array.from({ length: 7 }, (_, i) => shiftDayKey(start, i));
}

/** Sessions on one calendar day, soonest first — past ones included. */
export function sessionsOnDay<T extends TimedSession>(sessions: T[], key: string): T[] {
  return sessions.filter((s) => dateKeyOf(s.date) === key).sort(byStart);
}

/** `true` while the session has started and has not yet run 45 minutes. */
export function isHappeningNow(session: TimedSession, now: Date = new Date()): boolean {
  const start = startsAt(session).getTime();
  return now.getTime() >= start && now.getTime() < start + STILL_NOW_MS;
}
