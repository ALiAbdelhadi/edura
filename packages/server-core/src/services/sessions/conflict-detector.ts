import type { TenantTx } from "../../db/scope";
import { toDateKey } from "../../lib/date-key";

type ConflictCheck = {
  teacherId: string;
  roomId?: string | null;
  date: Date;
  startTime: string;
  endTime: string;
  excludeSessionId?: string;
};

type ConflictDetail = {
  sessionId: string;
  courseTitle: string;
  date: string;
  startTime: string;
  endTime: string;
};

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

export async function checkConflicts(
  tx: TenantTx,
  input: ConflictCheck,
): Promise<ConflictDetail[]> {
  const { teacherId, roomId, date, startTime, endTime, excludeSessionId } = input;

  const dateStart = new Date(date);
  dateStart.setUTCHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);

  const orClauses: { teacherId?: string; roomId?: string }[] = [{ teacherId }];
  if (roomId) orClauses.push({ roomId });

  const clashes = await tx.session.findMany({
    where: {
      date: { gte: dateStart, lt: dateEnd },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      status: { in: ["scheduled", "postponed"] },
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      OR: orClauses,
    },
    select: { id: true, courseId: true, startTime: true, endTime: true, date: true },
  });

  if (!clashes.length) return [];

  const courseIds = [...new Set(clashes.map((s) => s.courseId))];
  const courses = await tx.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, title: true },
  });
  const courseMap = new Map(courses.map((c) => [c.id, c.title]));

  return clashes.map((s) => ({
    sessionId: s.id,
    courseTitle: courseMap.get(s.courseId) ?? "Unknown",
    date: toDateKey(s.date),
    startTime: s.startTime,
    endTime: s.endTime,
  }));
}
