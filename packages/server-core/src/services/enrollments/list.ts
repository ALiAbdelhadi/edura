import { Prisma, type Enrollment } from "@repo/database";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { ForbiddenError } from "../../errors/classes";

export type ListEnrollmentsInput = {
  courseId: string | null;
  status: string | null;
  studentId: string | null;
};

type EnrollmentRow = Enrollment & {
  _ok?: boolean;
  _cId: string | null;
  _cTitle: string | null;
  _cSubject: string | null;
  _cPrice: number | null;
  _cDaysOfWeek: number[] | null;
  _cStartTime: string | null;
  _cEndTime: string | null;
  _cStartDate: Date | null;
  _cEndDate: Date | null;
  _studentName: string | null;
  _studentEmail: string | null;
  _studentCode: string | null;
};

function centerEq(col: Prisma.Sql, centerId: string | null | undefined): Prisma.Sql[] {
  if (centerId === undefined) return [];
  if (centerId === null) return [Prisma.sql`${col} IS NULL`];
  return [Prisma.sql`${col} = ${centerId}::uuid`];
}

export function listEnrollmentsForUser(user: SessionUser, input: ListEnrollmentsInput) {
  const { courseId, status, studentId: resolvedStudentId } = input;

  return scopedDb(user, async (tx) => {
    const conds: Prisma.Sql[] = [];
    let gate: Prisma.Sql | null = null;
    if (courseId && user.role !== "teacher") conds.push(Prisma.sql`e.course_id = ${courseId}::uuid`);
    if (status) conds.push(Prisma.sql`e.status = ${status}::enrollment_status`);

    if (user.role === "center_admin") {
      conds.push(...centerEq(Prisma.sql`e.center_id`, user.centerId));
      if (resolvedStudentId) conds.push(Prisma.sql`e.student_id = ${resolvedStudentId}::uuid`);
    } else if (user.role === "student") {
      conds.push(Prisma.sql`e.student_id = ${user.id}::uuid`);
    } else if (user.role === "parent") {
      if (resolvedStudentId) {
        gate = Prisma.sql`EXISTS (SELECT 1 FROM parent_student_links
          WHERE parent_id = ${user.id}::uuid AND student_id = ${resolvedStudentId}::uuid AND status = 'approved')`;
        conds.push(Prisma.sql`e.student_id = ${resolvedStudentId}::uuid`);
      } else {
        conds.push(Prisma.sql`e.student_id IN (SELECT student_id FROM parent_student_links
          WHERE parent_id = ${user.id}::uuid AND status = 'approved')`);
      }
    } else if (user.role === "teacher") {
      conds.push(
        courseId
          ? Prisma.sql`e.course_id = (SELECT id FROM courses WHERE teacher_id = ${user.id}::uuid AND id::text = ${courseId})`
          : Prisma.sql`e.course_id IN (SELECT id FROM courses WHERE teacher_id = ${user.id}::uuid)`,
      );
      if (resolvedStudentId) conds.push(Prisma.sql`e.student_id = ${resolvedStudentId}::uuid`);
    } else {
      throw new ForbiddenError();
    }

    const inner = Prisma.sql`
      SELECT e.id, e.student_id AS "studentId", e.course_id AS "courseId", e.center_id AS "centerId",
             e.status, e.enrolled_at AS "enrolledAt", e.unenrolled_at AS "unenrolledAt",
             e.enrolled_by AS "enrolledBy", e.data_source AS "dataSource",
             e.created_at AS "createdAt", e.updated_at AS "updatedAt",
             c.id AS "_cId", c.title AS "_cTitle", c.subject AS "_cSubject", c.price AS "_cPrice",
             coalesce(c.days_of_week, '{}') AS "_cDaysOfWeek", c.start_time AS "_cStartTime",
             c.end_time AS "_cEndTime", c.start_date AS "_cStartDate", c.end_date AS "_cEndDate",
             (SELECT u.name FROM users u WHERE u.id = e.student_id AND u.deleted_at IS NULL) AS "_studentName",
             (SELECT u.email FROM users u WHERE u.id = e.student_id AND u.deleted_at IS NULL) AS "_studentEmail",
             (SELECT sp.student_code FROM student_profiles sp WHERE sp.user_id = e.student_id) AS "_studentCode"
        FROM enrollments e
        LEFT JOIN LATERAL (SELECT * FROM courses WHERE id = e.course_id LIMIT 1) c ON true
       ${conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty}`;

    let rows: EnrollmentRow[];
    if (gate) {
      const gated = await tx.$queryRaw<EnrollmentRow[]>`
        SELECT g.ok AS "_ok", r.* FROM (SELECT ${gate} AS ok) g LEFT JOIN LATERAL (${inner}) r ON g.ok`;
      if (!gated[0]?._ok) throw new ForbiddenError("Not linked to this student");
      rows = gated.filter((r) => r.id !== null);
      for (const r of rows) delete r._ok;
    } else {
      rows = await tx.$queryRaw<EnrollmentRow[]>(inner);
    }

    return rows.map((row) => {
      const {
        _cId, _cTitle, _cSubject, _cPrice, _cDaysOfWeek, _cStartTime, _cEndTime,
        _cStartDate, _cEndDate, _studentName, _studentEmail, _studentCode, ...e
      } = row;
      const hasCourse = _cId !== null;
      return {
        ...e,
        courseName: hasCourse ? (_cTitle as string) : "",
        subject: hasCourse ? (_cSubject as string) : "",
        schedulePattern: hasCourse
          ? {
              daysOfWeek: _cDaysOfWeek as number[],
              startTime: _cStartTime as string,
              endTime: _cEndTime as string,
              startDate: _cStartDate as Date,
              endDate: _cEndDate,
            }
          : null,
        coursePrice: hasCourse ? (_cPrice as number) : 0,
        studentName: _studentName ?? "",
        studentEmail: _studentEmail ?? "",
        studentCode: _studentCode ?? null,
      };
    });
  });
}
