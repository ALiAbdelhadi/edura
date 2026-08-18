import type { TenantTx } from "../../db/scope";
import { toDateKey } from "../../lib/date-key";

// Moved here from apps/www so BOTH apps run the SAME scheduling conflict check.
// apps/www/src/lib/services/sessions/conflict-detector.ts is a re-export shim.

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

/**
 * THE clash rule, as one predicate.
 *
 * Half-open on purpose: a session ending at 16:00 and one starting at 16:00 do
 * NOT clash — back-to-back lessons in the same hall are the normal way a
 * center runs its day, and flagging them would make the calendar cry wolf
 * until nobody reads it. This is the same comparison the query below sends to
 * Postgres (`start_time < :end AND end_time > :start`), written once here so
 * the read side and the write side cannot disagree about what "overlap" means.
 *
 * Times are "HH:MM" strings; lexicographic comparison is correct for a
 * zero-padded 24-hour clock, which is what the schema stores.
 */
export function timesOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  return a.startTime < b.endTime && a.endTime > b.startTime;
}

/** A session as the calendar sees it — the shape /api/v1/sessions returns. */
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
  /** What they share. A pair can clash on both; `room` is reported first
   *  because a double-booked hall is the one a center must resolve today. */
  on: "room" | "teacher";
};

/**
 * Find every clash WITHIN an already-fetched set of sessions — the calendar's
 * read side.
 *
 * NOT a second implementation of `checkConflicts`. That one is the WRITE gate:
 * it asks the database "would this new booking clash with anything?" before a
 * session exists. This one asks "does what is ALREADY on the board clash with
 * itself?", over a list the caller has in hand, so a week view can mark the
 * damage without a query per cell. Both apply `timesOverlap` and both ignore
 * cancelled/completed sessions, so a pair the calendar marks red is a pair the
 * booking gate would also have refused.
 *
 * Pure and dependency-free: no database, no clock, no ordering assumptions.
 */
export function findScheduleClashes(sessions: SchedulableSession[]): ScheduleClash[] {
  const live = sessions.filter((s) => s.status === "scheduled" || s.status === "postponed");
  // Bucket by calendar day first: sessions on different days can never clash,
  // and this keeps the pairwise comparison to a day's worth of rows.
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

/** Ids involved in any clash — what a grid needs to colour a cell. */
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
