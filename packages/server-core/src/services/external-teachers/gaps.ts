import { Prisma } from "@repo/database";
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

const ISO_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

type GapData = {
  teacherCount: number;
  teachers: { id: string; name: string }[];
  courses: {
    id: string;
    title: string;
    teacherId: string;
    pricePerMonth: number | null;
    pricePerSession: number | null;
  }[];
  sessionCounts: { courseId: string; n: number }[];
  enrollmentCounts: { courseId: string; n: number }[];
  sessions: {
    id: string;
    courseId: string;
    date: string;
    status: string;
    distributed: boolean;
    marked: number;
  }[];
  enrollments: { id: string; studentId: string; courseId: string }[];
  covered: { studentId: string; courseId: string }[];
  students: { id: string; name: string }[];
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
    const teacherFilter = opts.teacherId
      ? Prisma.sql`AND user_id = ${opts.teacherId}::uuid`
      : Prisma.empty;
    const [data] = await tx.$queryRaw<GapData[]>`
      WITH tp AS (
        SELECT user_id FROM teacher_profiles
         WHERE managed_by_center_id = ${centerId}::uuid AND system_status = 'external' ${teacherFilter}
      ),
      cs AS (
        SELECT id, title, teacher_id, price_per_month, price_per_session FROM courses
         WHERE center_id = ${centerId}::uuid AND status = 'active'
           AND teacher_id IN (SELECT user_id FROM tp)
      ),
      en AS (
        SELECT id, student_id, course_id FROM enrollments
         WHERE course_id IN (SELECT id FROM cs) AND status = 'active'
      )
      SELECT
        (SELECT count(*)::int FROM tp) AS "teacherCount",
        (SELECT coalesce(json_agg(json_build_object('id', id, 'name', name)), '[]'::json)
           FROM users WHERE id IN (SELECT user_id FROM tp) AND deleted_at IS NULL) AS teachers,
        (SELECT coalesce(json_agg(json_build_object(
            'id', id, 'title', title, 'teacherId', teacher_id,
            'pricePerMonth', price_per_month, 'pricePerSession', price_per_session)), '[]'::json)
           FROM cs) AS courses,
        (SELECT coalesce(json_agg(json_build_object('courseId', course_id, 'n', n)), '[]'::json)
           FROM (SELECT course_id, count(*)::int AS n FROM sessions
                  WHERE course_id IN (SELECT id FROM cs) GROUP BY course_id) x) AS "sessionCounts",
        (SELECT coalesce(json_agg(json_build_object('courseId', course_id, 'n', n)), '[]'::json)
           FROM (SELECT course_id, count(*)::int AS n FROM en GROUP BY course_id) x) AS "enrollmentCounts",
        (SELECT coalesce(json_agg(json_build_object(
            'id', s.id, 'courseId', s.course_id,
            'date', to_char(s.date AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)}),
            'status', s.status::text, 'distributed', s.distributed_at IS NOT NULL,
            'marked', (SELECT count(*)::int FROM attendance_records a WHERE a.session_id = s.id)
          ) ORDER BY s.date DESC), '[]'::json)
           FROM (SELECT id, course_id, date, status, distributed_at FROM sessions
                  WHERE course_id IN (SELECT id FROM cs)
                    AND date >= ${from}::timestamptz AND date <= ${to}::timestamptz
                    AND status <> 'cancelled'
                  ORDER BY date DESC LIMIT 1000) s) AS sessions,
        (SELECT coalesce(json_agg(json_build_object('id', id, 'studentId', student_id, 'courseId', course_id)), '[]'::json)
           FROM en) AS enrollments,
        (SELECT coalesce(json_agg(json_build_object('studentId', student_id, 'courseId', course_id)), '[]'::json)
           FROM (SELECT DISTINCT student_id, course_id FROM subscriptions
                  WHERE course_id IN (SELECT id FROM cs) AND status = 'active'
                    AND (period_end IS NULL OR period_end >= ${now}::timestamptz)) x) AS covered,
        (SELECT coalesce(json_agg(json_build_object('id', id, 'name', name)), '[]'::json)
           FROM users WHERE id IN (SELECT student_id FROM en) AND deleted_at IS NULL) AS students`;

    const empty = (gaps: Gap[]): GapReport => ({
      generatedAt: now,
      scope: { teacherId: opts.teacherId ?? null, from, to },
      gaps,
      counts: { ...EMPTY_COUNTS },
      blocking: 0,
    });
    if (!data || !data.teacherCount) return empty([]);

    const teachers = data.teachers;
    const courses = data.courses;
    const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
    const courseById = new Map(courses.map((c) => [c.id, c]));

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

    if (!courses.length) return empty(gaps);

    const sessionsPerCourse = new Map(data.sessionCounts.map((s) => [s.courseId, s.n]));
    const studentsPerCourse = new Map(data.enrollmentCounts.map((e) => [e.courseId, e.n]));

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

    for (const row of data.sessions) {
      const s = { ...row, date: new Date(row.date) };
      if (s.date > now) continue;
      const marked = s.marked;
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
          detail: { status: s.status, settled: s.distributed ? "yes" : "no" },
        });
      }
    }

    const enrollments = data.enrollments;
    if (enrollments.length) {
      const covered = new Set(data.covered.map((s) => `${s.studentId}:${s.courseId}`));
      const studentName = new Map(data.students.map((s) => [s.id, s.name]));

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
