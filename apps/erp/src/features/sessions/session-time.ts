import { platformInstant, shiftDayKey, todayKey } from "@repo/shared/date-key";

export type TimedSession = {
  date: string | Date;
  startTime?: string | null;
  status?: string | null;
};

const LIVE_STATUSES = new Set(["scheduled", "postponed"]);

const STILL_NOW_MS = 45 * 60 * 1000;

export function dateKeyOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const CLOCK = /^(\d{2}):(\d{2})$/;

export function startsAt(session: TimedSession): Date {
  const key = dateKeyOf(session.date);
  const clock = CLOCK.exec(session.startTime || "00:00");
  if (!DAY_KEY.test(key) || !clock) return new Date(NaN);
  return platformInstant(key, Number(clock[1]), Number(clock[2]), 0, 0);
}

export function byStart(a: TimedSession, b: TimedSession): number {
  return startsAt(a).getTime() - startsAt(b).getTime();
}

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

export function weekDayKeys(now: Date = new Date(), offsetWeeks = 0): string[] {
  const key = todayKey(now);
  const dow = new Date(
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))),
  ).getUTCDay();
  const start = shiftDayKey(key, offsetWeeks * 7 - dow);
  return Array.from({ length: 7 }, (_, i) => shiftDayKey(start, i));
}

export function sessionsOnDay<T extends TimedSession>(sessions: T[], key: string): T[] {
  return sessions.filter((s) => dateKeyOf(s.date) === key).sort(byStart);
}

export function isHappeningNow(session: TimedSession, now: Date = new Date()): boolean {
  const start = startsAt(session).getTime();
  return now.getTime() >= start && now.getTime() < start + STILL_NOW_MS;
}
