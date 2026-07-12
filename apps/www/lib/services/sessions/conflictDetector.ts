import type { TenantTx } from "@/lib/db/scope";

type ConflictCheck = {
  teacherId: string;
  roomId?: string | null;
  date: Date;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
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
 * Detects room/teacher clashes for a proposed session slot. Runs inside the
 * caller's transaction (`tx`) so it never opens a nested DB context.
 */
export async function checkConflicts(
  tx: TenantTx,
  input: ConflictCheck,
): Promise<ConflictDetail[]> {
  const { teacherId, roomId, date, startTime, endTime, excludeSessionId } = input;

  const dateStart = new Date(date);
  dateStart.setUTCHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);

  // teacher OR room clash on the same day, overlapping time window
  const orClauses: { teacherId?: string; roomId?: string }[] = [{ teacherId }];
  if (roomId) orClauses.push({ roomId });

  const clashes = await tx.session.findMany({
    where: {
      date: { gte: dateStart, lt: dateEnd },
      // Time overlap: existing.startTime < new.endTime && existing.endTime > new.startTime
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
    date: s.date.toISOString().split("T")[0],
    startTime: s.startTime,
    endTime: s.endTime,
  }));
}
