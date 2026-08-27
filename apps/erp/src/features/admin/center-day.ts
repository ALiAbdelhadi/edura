import { PLATFORM_TIME_ZONE } from "@repo/server-core/lib/date-key";
export type CenterSession = {
  id: string;
  date: string | Date;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
  distributedAt?: string | null;
  courseName?: string | null;
  teacherName?: string | null;
  roomName?: string | null;
};
const WALL_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLATFORM_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

export function platformNowHHMM(now: Date = new Date()): string {
  return WALL_CLOCK.format(now);
}

export function sessionDayKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

const RUNNING = new Set(["scheduled", "ongoing"]);

/**
 * The lessons occupying a hall at this moment.
 *
 * ── WHY `todayKey` IS REQUIRED AND HAS NO DEFAULT ─────────────────────────
 *
 * It was optional until 2026-08-27, falling back to
 * `sessionDayKey(now.toISOString())` — the UTC day of an INSTANT. That is the
 * exact mistake `@repo/server-core/lib/date-key` was written to eliminate:
 * between Cairo midnight and 02:00 (03:00 on DST) the UTC date is still
 * YESTERDAY, so the board would have gone blank at the hour a late class is
 * still running.
 *
 * The fallback was never reached — the only caller has always passed the Cairo
 * day — so this is not a bug being fixed, it is a loaded gun being unloaded.
 * The next caller to omit the argument would have inherited a wrong-day board
 * with nothing to warn them, and a hall wrongly shown empty sends an operator
 * to the wrong room.
 *
 * Required, therefore, rather than defaulted to the right thing: a default
 * would still let a call site stay silent about which day it means, and the
 * whole point of `date-key` is that every caller says which question it is
 * asking. Pass `todayKey()` from `@repo/server-core/lib/date-key`.
 */
export function liveNow(
  sessions: readonly CenterSession[],
  now: Date,
  todayKey: string,
): CenterSession[] {
  const hhmm = platformNowHHMM(now);
  return sessions
    .filter((s) => {
      if (!RUNNING.has(String(s.status ?? "scheduled"))) return false;
      if (sessionDayKey(s.date) !== todayKey) return false;
      const start = s.startTime ?? "";
      const end = s.endTime ?? "";
      if (!start || !end || end <= start) return false;
      return start <= hhmm && hhmm < end;
    })
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

export function awaitingSettlement(sessions: readonly CenterSession[]): CenterSession[] {
  return sessions
    .filter((s) => s.status === "completed" && !s.distributedAt)
    .sort((a, b) => sessionDayKey(b.date).localeCompare(sessionDayKey(a.date)));
}
