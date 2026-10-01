import { PLATFORM_TIME_ZONE } from "@repo/shared/date-key";
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
