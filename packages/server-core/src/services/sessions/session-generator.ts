import type { DataSource } from "@repo/database";
import { scopedDb, type TenantTx } from "../../db/scope";
import { toDateKey } from "../../lib/date-key";
import type { SessionUser } from "../../auth/types";
import { ConflictError } from "../../errors/classes";

type SchedulePattern = {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate: Date;
};

export type CourseInput = {
  id: string;
  schedulePattern: SchedulePattern;
  teacherId: string;
  defaultRoomId?: string | null;
  dataSource?: DataSource;
};

function walkDates(startDate: Date, endDate: Date, daysOfWeek: number[]): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    if (daysOfWeek.includes(cursor.getUTCDay())) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayStart(d: Date): number {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.getTime();
}

type RangeConflict = {
  sessionId: string;
  courseTitle: string;
  date: string;
  startTime: string;
  endTime: string;
};

// One query over the whole range instead of checkConflicts() per occurrence;
// each clash is bucketed into the same UTC day window checkConflicts uses.
async function conflictsByDay(
  tx: TenantTx,
  input: {
    teacherId: string;
    roomId?: string | null;
    dates: Date[];
    startTime: string;
    endTime: string;
  },
): Promise<Map<number, RangeConflict[]>> {
  const byDay = new Map<number, RangeConflict[]>();
  if (!input.dates.length) return byDay;

  const days = input.dates.map(utcDayStart);
  const wanted = new Set(days);
  const from = new Date(Math.min(...days));
  const to = new Date(Math.max(...days) + DAY_MS);

  const orClauses: { teacherId?: string; roomId?: string }[] = [
    { teacherId: input.teacherId },
  ];
  if (input.roomId) orClauses.push({ roomId: input.roomId });

  const clashes = await tx.session.findMany({
    where: {
      date: { gte: from, lt: to },
      startTime: { lt: input.endTime },
      endTime: { gt: input.startTime },
      status: { in: ["scheduled", "postponed"] },
      OR: orClauses,
    },
    select: { id: true, courseId: true, startTime: true, endTime: true, date: true },
  });
  const relevant = clashes.filter((c) => wanted.has(utcDayStart(c.date)));
  if (!relevant.length) return byDay;

  const courseIds = [...new Set(relevant.map((c) => c.courseId))];
  const courses = await tx.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, title: true },
  });
  const courseMap = new Map(courses.map((c) => [c.id, c.title]));

  for (const c of relevant) {
    const key = utcDayStart(c.date);
    const list = byDay.get(key) ?? [];
    list.push({
      sessionId: c.id,
      courseTitle: courseMap.get(c.courseId) ?? "Unknown",
      date: toDateKey(c.date),
      startTime: c.startTime,
      endTime: c.endTime,
    });
    byDay.set(key, list);
  }
  return byDay;
}

export async function generateSessionsTx(tx: TenantTx, course: CourseInput): Promise<string[]> {
  const { schedulePattern, teacherId, defaultRoomId } = course;
  const dates = walkDates(
    schedulePattern.startDate,
    schedulePattern.endDate,
    schedulePattern.daysOfWeek,
  );

  const existing = await tx.session.findMany({
    where: { courseId: course.id },
    select: { originalDate: true },
  });
  const existingDates = new Set(
    existing.map((s) => toDateKey(s.originalDate)),
  );

  const toInsert: {
    courseId: string;
    teacherId: string;
    roomId: string | null;
    originalDate: Date;
    date: Date;
    startTime: string;
    endTime: string;
    status: "scheduled";
    dataSource?: DataSource;
  }[] = [];
  const conflicts: object[] = [];

  const candidates = dates.filter((date) => !existingDates.has(toDateKey(date)));
  const clashesByDay = await conflictsByDay(tx, {
    teacherId,
    roomId: defaultRoomId ?? undefined,
    dates: candidates,
    startTime: schedulePattern.startTime,
    endTime: schedulePattern.endTime,
  });

  for (const date of candidates) {
    const clashes = clashesByDay.get(utcDayStart(date)) ?? [];

    if (clashes.length > 0) {
      conflicts.push(...clashes);
      continue;
    }

    toInsert.push({
      courseId: course.id,
      teacherId,
      roomId: defaultRoomId ?? null,
      originalDate: date,
      date,
      startTime: schedulePattern.startTime,
      endTime: schedulePattern.endTime,
      status: "scheduled",
      ...(course.dataSource ? { dataSource: course.dataSource } : {}),
    });
  }

  if (conflicts.length > 0) {
    throw new ConflictError("Schedule conflicts detected", { conflicts });
  }

  if (!toInsert.length) return [];
  const inserted = await tx.session.createManyAndReturn({
    data: toInsert,
    select: { id: true },
  });
  return inserted.map((s) => s.id);
}

export async function generateSessions(
  course: CourseInput,
  user: SessionUser,
): Promise<string[]> {
  return scopedDb(user, (tx) => generateSessionsTx(tx, course));
}

export async function regenerateFutureSessionsTx(
  tx: TenantTx,
  course: CourseInput,
  newPattern: SchedulePattern,
): Promise<string[]> {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  await tx.session.deleteMany({
    where: {
      courseId: course.id,
      date: { gte: now },
      status: "scheduled",
      attendance: { none: {} },
    },
  });

  const effectiveStart = newPattern.startDate > now ? newPattern.startDate : now;

  return generateSessionsTx(tx, {
    ...course,
    schedulePattern: { ...newPattern, startDate: effectiveStart },
  });
}

export async function regenerateFutureSessions(
  course: CourseInput,
  newPattern: SchedulePattern,
  user: SessionUser,
): Promise<string[]> {
  return scopedDb(user, (tx) => regenerateFutureSessionsTx(tx, course, newPattern));
}
