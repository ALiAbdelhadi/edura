import { platformDb, type TenantTx } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { dayRange } from "../../lib/day-range";
import { shiftDayKey, todayKey } from "../../lib/date-key";

export type TeacherCoverageState = "covered" | "per_session" | "lapsed" | "none";

export type TeacherCoverageStudent = {
  studentId: string;
  name: string;
  state: TeacherCoverageState;
  coveredUntil: Date | null;
  lastCoveredUntil: Date | null;
  passesInPeriod: number;
};

const STATE_ORDER: Record<TeacherCoverageState, number> = {
  lapsed: 0, // the question this endpoint exists to answer, so it leads
  none: 1,
  per_session: 2,
  covered: 3,
};

const DEFAULT_PERIOD_DAYS = 30;

async function loadGroups(tx: TenantTx, teacherId: string, courseId?: string) {
  if (courseId) {
    const course = await tx.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, teacherId: true, status: true, pricePerMonth: true, pricePerSession: true },
    });
    if (!course || course.teacherId !== teacherId) {
      throw new NotFoundError("Course not found");
    }
    return [course];
  }
  return tx.course.findMany({
    where: { teacherId, status: "active" },
    select: { id: true, title: true, teacherId: true, status: true, pricePerMonth: true, pricePerSession: true },
    orderBy: { title: "asc" },
  });
}

export async function getTeacherCoverage(
  teacher: SessionUser,
  opts?: { courseId?: string; from?: string; to?: string },
) {
  const from = opts?.from ?? shiftDayKey(todayKey(), -DEFAULT_PERIOD_DAYS);
  const to = opts?.to ?? todayKey();
  const passWindow = dayRange(from, to);
  const now = new Date();

  return platformDb(async (tx) => {
    const courses = await loadGroups(tx, teacher.id, opts?.courseId);
    const courseIds = courses.map((c) => c.id);
    if (courseIds.length === 0) return { period: { from, to }, groups: [] };

    const enrollments = await tx.enrollment.findMany({
      where: { courseId: { in: courseIds }, status: "active" },
      select: { courseId: true, studentId: true },
    });
    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

    const [students, monthly, passes] = await Promise.all([
      studentIds.length
        ? tx.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      studentIds.length
        ? tx.subscription.findMany({
            where: {
              courseId: { in: courseIds },
              studentId: { in: studentIds },
              plan: "monthly",
              status: { in: ["active", "expired"] },
            },
            select: { courseId: true, studentId: true, status: true, periodStart: true, periodEnd: true },
          })
        : Promise.resolve([]),
      studentIds.length
        ? tx.subscription.findMany({
            where: {
              courseId: { in: courseIds },
              studentId: { in: studentIds },
              plan: "per_session",
              status: "active",
            },
            select: { courseId: true, studentId: true, sessionId: true },
          })
        : Promise.resolve([]),
    ]);

    const passSessionIds = [...new Set(passes.map((p) => p.sessionId).filter(Boolean))] as string[];
    const inWindow = new Set(
      passSessionIds.length
        ? (
            await tx.session.findMany({
              where: { id: { in: passSessionIds }, date: { gte: passWindow?.gte, lte: passWindow?.lte } },
              select: { id: true },
            })
          ).map((s) => s.id)
        : [],
    );

    const nameOf = new Map(students.map((s) => [s.id, s.name ?? ""]));
    const key = (courseId: string, studentId: string) => `${courseId}:${studentId}`;

    type MonthlyRow = {
      courseId: string;
      studentId: string;
      status: string;
      periodStart: Date | null;
      periodEnd: Date | null;
    };
    const monthlyByPair = new Map<string, MonthlyRow[]>();
    for (const sub of monthly) {
      const k = key(sub.courseId, sub.studentId);
      const list = monthlyByPair.get(k);
      if (list) list.push(sub);
      else monthlyByPair.set(k, [sub]);
    }
    const passCount = new Map<string, number>();
    for (const p of passes) {
      if (!p.sessionId || !inWindow.has(p.sessionId)) continue;
      const k = key(p.courseId, p.studentId);
      passCount.set(k, (passCount.get(k) ?? 0) + 1);
    }

    const groups = courses.map((course) => {
      const roster = enrollments.filter((e) => e.courseId === course.id);
      const rows: TeacherCoverageStudent[] = roster.map((e) => {
        const k = key(course.id, e.studentId);
        const subs = monthlyByPair.get(k) ?? [];
        const live = subs.filter(
          (s) => s.status === "active" && s.periodStart && s.periodEnd && s.periodStart <= now && s.periodEnd >= now,
        );
        const ended = subs.filter((s) => s.periodEnd && s.periodEnd < now);
        const pass = passCount.get(k) ?? 0;

        let state: TeacherCoverageState;
        let coveredUntil: Date | null = null;
        let lastCoveredUntil: Date | null = null;
        if (live.length > 0) {
          state = "covered";
          coveredUntil = live.reduce<Date | null>(
            (max, s) => (!max || (s.periodEnd && s.periodEnd > max) ? s.periodEnd : max),
            null,
          );
        } else if (pass > 0) {
          state = "per_session";
        } else if (ended.length > 0) {
          state = "lapsed";
          lastCoveredUntil = ended.reduce<Date | null>(
            (max, s) => (!max || (s.periodEnd && s.periodEnd > max) ? s.periodEnd : max),
            null,
          );
        } else {
          state = "none";
        }

        return {
          studentId: e.studentId,
          name: nameOf.get(e.studentId) ?? "",
          state,
          coveredUntil,
          lastCoveredUntil,
          passesInPeriod: pass,
        };
      });

      rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name));

      const counts = { covered: 0, per_session: 0, lapsed: 0, none: 0 };
      for (const r of rows) counts[r.state] += 1;

      return {
        courseId: course.id,
        title: course.title,
        plans: { monthly: course.pricePerMonth != null, perSession: course.pricePerSession != null },
        counts,
        students: rows,
      };
    });

    return { period: { from, to }, groups };
  });
}
