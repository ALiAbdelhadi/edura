import { scopedDb } from "../../db/scope";
import { ForbiddenError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

export type GapKind =
  | "lesson_without_attendance"
  | "partial_attendance"
  | "session_not_completed"
  | "enrolled_unpaid"
  | "group_without_schedule"
  | "group_without_price"
  | "group_without_students";

export type Gap = {
  kind: GapKind;
  severity: "blocking" | "warning";
  teacherId: string;
  teacherName: string;
  targetType: "session" | "course" | "enrollment";
  targetId: string;
  courseId: string;
  courseTitle: string;
  date: Date | null;
  detail: Record<string, string | number | null>;
};

export type GapReport = {
  generatedAt: Date;
  scope: { teacherId: string | null; from: Date; to: Date };
  gaps: Gap[];
  counts: Record<GapKind, number>;
  blocking: number;
};

const EMPTY_COUNTS: Record<GapKind, number> = {
  lesson_without_attendance: 0,
  partial_attendance: 0,
  session_not_completed: 0,
  enrolled_unpaid: 0,
  group_without_schedule: 0,
  group_without_price: 0,
  group_without_students: 0,
};

export async function buildGapReport(
  acting: SessionUser,
  opts: { teacherId?: string | null; from?: Date; to?: Date } = {},
): Promise<GapReport> {
  const centerId = acting.centerId;
  if (!centerId) throw new ForbiddenError("Actor has no center scope");

  const now = new Date();
  const from = opts.from ?? new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const to = opts.to ?? now;

  return scopedDb(acting, async (tx) => {
    const externalProfiles = await tx.teacherProfile.findMany({
      where: {
        managedByCenterId: centerId,
        systemStatus: "external",
        ...(opts.teacherId ? { userId: opts.teacherId } : {}),
      },
      select: { userId: true },
    });
    const teacherIds = externalProfiles.map((p) => p.userId);
    if (!teacherIds.length) {
      return { generatedAt: now, scope: { teacherId: opts.teacherId ?? null, from, to }, gaps: [], counts: { ...EMPTY_COUNTS }, blocking: 0 };
    }

    const [teachers, courses] = await Promise.all([
      tx.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } }),
      tx.course.findMany({
        where: { centerId, teacherId: { in: teacherIds }, status: "active" },
        select: {
          id: true,
          title: true,
          teacherId: true,
          price: true,
          pricePerMonth: true,
          pricePerSession: true,
        },
      }),
    ]);
    const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const courseIds = courses.map((c) => c.id);

    const gaps: Gap[] = [];
    const push = (g: Gap) => gaps.push(g);
    const base = (courseId: string) => {
      const c = courseById.get(courseId)!;
      return {
        teacherId: c.teacherId,
        teacherName: teacherName.get(c.teacherId) ?? "",
        courseId: c.id,
        courseTitle: c.title,
      };
    };

    if (!courseIds.length) {
      return { generatedAt: now, scope: { teacherId: opts.teacherId ?? null, from, to }, gaps, counts: { ...EMPTY_COUNTS }, blocking: 0 };
    }

    const [sessionCounts, enrollmentCounts] = await Promise.all([
      tx.session.groupBy({
        by: ["courseId"],
        where: { courseId: { in: courseIds } },
        _count: { _all: true },
      }),
      tx.enrollment.groupBy({
        by: ["courseId"],
        where: { courseId: { in: courseIds }, status: "active" },
        _count: { _all: true },
      }),
    ]);
    const sessionsPerCourse = new Map(sessionCounts.map((s) => [s.courseId, s._count._all]));
    const studentsPerCourse = new Map(enrollmentCounts.map((e) => [e.courseId, e._count._all]));

    for (const c of courses) {
      if (!sessionsPerCourse.get(c.id)) {
        push({
          kind: "group_without_schedule",
          severity: "blocking",
          ...base(c.id),
          targetType: "course",
          targetId: c.id,
          date: null,
          detail: { sessions: 0 },
        });
      }
      if (!c.pricePerMonth && !c.pricePerSession) {
        push({
          kind: "group_without_price",
          severity: "blocking",
          ...base(c.id),
          targetType: "course",
          targetId: c.id,
          date: null,
          detail: { pricePerMonth: c.pricePerMonth, pricePerSession: c.pricePerSession },
        });
      }
      if (!studentsPerCourse.get(c.id)) {
        push({
          kind: "group_without_students",
          severity: "warning",
          ...base(c.id),
          targetType: "course",
          targetId: c.id,
          date: null,
          detail: { students: 0 },
        });
      }
    }

    const sessions = await tx.session.findMany({
      where: {
        courseId: { in: courseIds },
        date: { gte: from, lte: to },
        status: { notIn: ["cancelled"] },
      },
      select: { id: true, courseId: true, date: true, status: true, distributedAt: true },
      orderBy: { date: "desc" },
      take: 1000,
    });

    if (sessions.length) {
      const sessionIds = sessions.map((s) => s.id);
      const attendanceCounts = await tx.attendanceRecord.groupBy({
        by: ["sessionId"],
        where: { sessionId: { in: sessionIds } },
        _count: { _all: true },
      });
      const markedPerSession = new Map(
        attendanceCounts.map((a) => [a.sessionId, a._count._all]),
      );

      for (const s of sessions) {
        if (s.date > now) continue;
        const marked = markedPerSession.get(s.id) ?? 0;
        const roster = studentsPerCourse.get(s.courseId) ?? 0;

        if (marked === 0) {
          push({
            kind: "lesson_without_attendance",
            severity: "blocking",
            ...base(s.courseId),
            targetType: "session",
            targetId: s.id,
            date: s.date,
            detail: { marked: 0, enrolled: roster },
          });
        } else if (roster > 0 && marked < roster) {
          push({
            kind: "partial_attendance",
            severity: "warning",
            ...base(s.courseId),
            targetType: "session",
            targetId: s.id,
            date: s.date,
            detail: { marked, enrolled: roster, missing: roster - marked },
          });
        }

        if (s.status !== "completed") {
          push({
            kind: "session_not_completed",
            severity: "blocking",
            ...base(s.courseId),
            targetType: "session",
            targetId: s.id,
            date: s.date,
            detail: { status: s.status, settled: s.distributedAt ? "yes" : "no" },
          });
        }
      }
    }

    const enrollments = await tx.enrollment.findMany({
      where: { courseId: { in: courseIds }, status: "active" },
      select: { id: true, studentId: true, courseId: true },
    });
    if (enrollments.length) {
      const activeSubs = await tx.subscription.findMany({
        where: {
          courseId: { in: courseIds },
          status: "active",
          OR: [{ periodEnd: null }, { periodEnd: { gte: now } }],
        },
        select: { studentId: true, courseId: true },
      });
      const covered = new Set(activeSubs.map((s) => `${s.studentId}:${s.courseId}`));
      const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
      const students = await tx.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true },
      });
      const studentName = new Map(students.map((s) => [s.id, s.name]));

      for (const e of enrollments) {
        if (covered.has(`${e.studentId}:${e.courseId}`)) continue;
        push({
          kind: "enrolled_unpaid",
          severity: "warning",
          ...base(e.courseId),
          targetType: "enrollment",
          targetId: e.id,
          date: null,
          detail: { studentId: e.studentId, studentName: studentName.get(e.studentId) ?? "" },
        });
      }
    }

    const counts = { ...EMPTY_COUNTS };
    for (const g of gaps) counts[g.kind] += 1;

    gaps.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1;
      return (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
    });

    return {
      generatedAt: now,
      scope: { teacherId: opts.teacherId ?? null, from, to },
      gaps,
      counts,
      blocking: gaps.filter((g) => g.severity === "blocking").length,
    };
  });
}
