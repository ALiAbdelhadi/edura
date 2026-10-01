import { toDateKey } from "./date-key";


export function timesOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  return a.startTime < b.endTime && a.endTime > b.startTime;
}

export type SchedulableSession = {
  id: string;
  date: Date | string;
  startTime: string;
  endTime: string;
  status: string;
  teacherId: string;
  roomId?: string | null;
};

export type ScheduleClash = {
  sessionId: string;
  otherSessionId: string;
  on: "room" | "teacher";
};

export function findScheduleClashes(sessions: SchedulableSession[]): ScheduleClash[] {
  const live = sessions.filter((s) => s.status === "scheduled" || s.status === "postponed");
  const byDay = new Map<string, SchedulableSession[]>();
  for (const s of live) {
    const key = toDateKey(s.date instanceof Date ? s.date : new Date(s.date));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(s);
    else byDay.set(key, [s]);
  }

  const clashes: ScheduleClash[] = [];
  for (const day of byDay.values()) {
    for (let i = 0; i < day.length; i++) {
      for (let j = i + 1; j < day.length; j++) {
        const a = day[i];
        const b = day[j];
        if (!timesOverlap(a, b)) continue;
        const sameRoom = Boolean(a.roomId) && a.roomId === b.roomId;
        const sameTeacher = a.teacherId === b.teacherId;
        if (!sameRoom && !sameTeacher) continue;
        clashes.push({
          sessionId: a.id,
          otherSessionId: b.id,
          on: sameRoom ? "room" : "teacher",
        });
      }
    }
  }
  return clashes;
}

export function clashingSessionIds(sessions: SchedulableSession[]): Set<string> {
  const ids = new Set<string>();
  for (const c of findScheduleClashes(sessions)) {
    ids.add(c.sessionId);
    ids.add(c.otherSessionId);
  }
  return ids;
}
