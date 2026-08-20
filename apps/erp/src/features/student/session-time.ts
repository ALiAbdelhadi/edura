/**
 * ONE derivation of "which lesson is next", and of "which day is a lesson on".
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
 * all. The clock time is then applied in the reader's own zone, which is where
 * a wall-clock lesson time belongs.
 */

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

/** `2026-08-20` — the calendar day, never shifted by a timezone. */
export function dateKeyOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today, in the reader's own zone, in the same shape as `dateKeyOf`. */
export function todayKey(now: Date = new Date()): string {
  return dateKeyOf(now);
}

/** The wall-clock instant a session begins, in the reader's zone. */
export function startsAt(session: TimedSession): Date {
  const key = dateKeyOf(session.date);
  const clock = session.startTime || "00:00";
  return new Date(`${key}T${clock}:00`);
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
 */
export function weekDayKeys(now: Date = new Date(), offsetWeeks = 0): string[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - start.getDay() + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dateKeyOf(d);
  });
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
