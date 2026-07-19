import { scopedDb, type TenantTx } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { ConflictError } from "@/lib/errors/classes";
import { checkConflicts } from "./conflict-detector";

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

// Exported so collaboration-request acceptance (Step 5) can generate the
// course's sessions INSIDE its own transaction (affiliation + course +
// sessions must commit or roll back together).
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
    existing.map((s) => s.originalDate.toISOString().split("T")[0]),
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
  }[] = [];
  const conflicts: object[] = [];

  for (const date of dates) {
    const dateStr = date.toISOString().split("T")[0];
    if (existingDates.has(dateStr)) continue;

    const clashes = await checkConflicts(tx, {
      teacherId,
      roomId: defaultRoomId ?? undefined,
      date,
      startTime: schedulePattern.startTime,
      endTime: schedulePattern.endTime,
    });

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

export async function regenerateFutureSessions(
  course: CourseInput,
  newPattern: SchedulePattern,
  user: SessionUser,
): Promise<string[]> {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  return scopedDb(user, async (tx) => {
    await tx.session.deleteMany({
      where: {
        courseId: course.id,
        date: { gte: now },
        status: "scheduled",
      },
    });

    return generateSessionsTx(tx, { ...course, schedulePattern: newPattern });
  });
}
