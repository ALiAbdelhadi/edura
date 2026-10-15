import { Prisma, type Session } from "@repo/database";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { ForbiddenError, NotFoundError } from "../../errors/classes";
import { approvedChildIds, assertApprovedChild } from "../wallet/parent-wallet-facade";

export type ListSessionsInput = {
  courseId: string | null;
  teacherId: string | null;
  from: string | null;
  to: string | null;
  studentId: string | null;
  limit?: number;
};

const SESSION_COLUMNS = Prisma.sql`
  s.id, s.course_id AS "courseId", s.teacher_id AS "teacherId", s.room_id AS "roomId",
  s.original_date AS "originalDate", s.date, s.start_time AS "startTime", s.end_time AS "endTime",
  s.status, s.cancellation_reason AS "cancellationReason", s.postponed_from_date AS "postponedFromDate",
  s.edited_at AS "editedAt", s.distributed_at AS "distributedAt",
  s.attendance_reopened_at AS "attendanceReopenedAt", s.attendance_reopened_by AS "attendanceReopenedBy",
  s.data_source AS "dataSource", s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;

type SessionListRow = Session & {
  _ok?: boolean;
  _courseName: string | null;
  _subject: string | null;
  _centerId: string | null;
  _teacherName: string | null;
  _roomName: string | null;
  _centerName: string | null;
};

export function listSessionsForUser(user: SessionUser, input: ListSessionsInput) {
  const { courseId, teacherId, from, to, studentId: studentIdParam, limit } = input;

  return scopedDb(user, async (tx) => {
    const conds: Prisma.Sql[] = [];
    let gate: Prisma.Sql | null = null;

    if (courseId && user.role === "teacher") conds.push(Prisma.sql`s.course_id = ${courseId}::uuid`);
    if (teacherId && user.role !== "teacher") conds.push(Prisma.sql`s.teacher_id = ${teacherId}::uuid`);
    if (from) conds.push(Prisma.sql`s.date >= ${new Date(from)}`);
    if (to) conds.push(Prisma.sql`s.date <= ${new Date(to)}`);

    if (user.role === "center_admin") {
      const centerId = user.centerId as string | null | undefined;
      const centerCourses =
        centerId === undefined
          ? Prisma.sql`SELECT id FROM courses WHERE true`
          : centerId === null
            ? Prisma.sql`SELECT id FROM courses WHERE center_id IS NULL`
            : Prisma.sql`SELECT id FROM courses WHERE center_id = ${centerId}::uuid`;
      if (courseId) {
        const match = Prisma.sql`${centerCourses} AND id::text = ${courseId}`;
        gate = Prisma.sql`EXISTS (${match})`;
        conds.push(Prisma.sql`s.course_id = (${match})`);
      } else {
        conds.push(Prisma.sql`s.course_id IN (${centerCourses})`);
      }
    } else if (user.role === "teacher") {
      conds.push(Prisma.sql`s.teacher_id = ${user.id}::uuid`);
    } else if (user.role === "student") {
      conds.push(Prisma.sql`s.course_id IN (SELECT course_id FROM enrollments
        WHERE student_id = ${user.id}::uuid AND status = 'active')`);
    } else if (user.role === "parent") {
      let studentIds: string[];
      if (studentIdParam && studentIdParam !== "me") {
        await assertApprovedChild(tx, user.id, studentIdParam);
        studentIds = [studentIdParam];
      } else {
        studentIds = await approvedChildIds(tx, user.id);
        if (studentIds.length === 0) throw new ForbiddenError("No linked children");
      }
      conds.push(Prisma.sql`s.course_id IN (SELECT course_id FROM enrollments
        WHERE student_id = ANY(${studentIds}::uuid[]) AND status = 'active')`);
    } else {
      throw new ForbiddenError("This role has no session scope on this route");
    }

    const inner = Prisma.sql`
      SELECT ${SESSION_COLUMNS},
             c.title AS "_courseName", c.subject AS "_subject", c.center_id AS "_centerId",
             (SELECT u.name FROM users u WHERE u.id = s.teacher_id AND u.deleted_at IS NULL) AS "_teacherName",
             (SELECT r.name FROM rooms r WHERE r.id = s.room_id) AS "_roomName",
             (SELECT ce.name FROM centers ce WHERE ce.id = c.center_id) AS "_centerName"
        FROM sessions s
        LEFT JOIN LATERAL (SELECT title, subject, center_id FROM courses WHERE id = s.course_id LIMIT 1) c ON true
       WHERE ${Prisma.join(conds, " AND ")}
       ORDER BY s.date ASC, s.start_time ASC
       ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}`;

    let rows: SessionListRow[];
    if (gate) {
      const gated = await tx.$queryRaw<SessionListRow[]>`
        SELECT g.ok AS "_ok", r.* FROM (SELECT ${gate} AS ok) g LEFT JOIN LATERAL (${inner}) r ON g.ok`;
      if (!gated[0]?._ok) throw new ForbiddenError("Course not in your center");
      rows = gated.filter((r) => r.id !== null);
      for (const r of rows) delete r._ok;
    } else {
      rows = await tx.$queryRaw<SessionListRow[]>(inner);
    }

    return rows.map(
      ({ _courseName, _subject, _centerId, _teacherName, _roomName, _centerName, ...s }) => ({
        ...s,
        courseName: _courseName ?? "",
        subject: _subject ?? "",
        teacherName: _teacherName ?? "",
        roomName: _roomName ?? "",
        centerId: _centerId ?? null,
        centerName: _centerName ?? "",
      }),
    );
  });
}

type SessionGetRow = Session & {
  _hasCourse: boolean;
  _courseCenterId: string | null;
  _enrolled: boolean | null;
};

export function getSessionForUser(user: SessionUser, id: string) {
  return scopedDb(user, async (tx) => {
    const enrolled =
      user.role === "student"
        ? Prisma.sql`EXISTS (SELECT 1 FROM enrollments
            WHERE course_id = s.course_id AND student_id = ${user.id}::uuid AND status = 'active')`
        : user.role === "parent"
          ? Prisma.sql`EXISTS (SELECT 1 FROM enrollments
              WHERE course_id = s.course_id AND status = 'active'
                AND student_id IN (SELECT student_id FROM parent_student_links
                                    WHERE parent_id = ${user.id}::uuid AND status = 'approved'))`
          : Prisma.sql`NULL::boolean`;
    const [row] = await tx.$queryRaw<SessionGetRow[]>`
      SELECT ${SESSION_COLUMNS},
             EXISTS (SELECT 1 FROM courses WHERE id = s.course_id) AS "_hasCourse",
             (SELECT center_id FROM courses WHERE id = s.course_id) AS "_courseCenterId",
             ${enrolled} AS "_enrolled"
        FROM sessions s
       WHERE s.id = ${id}::uuid`;
    if (!row) throw new NotFoundError("Session not found");
    const { _hasCourse, _courseCenterId, _enrolled, ...session } = row;

    if (user.role === "center_admin") {
      if (!_hasCourse || _courseCenterId !== user.centerId) {
        throw new ForbiddenError("Session not in your center");
      }
    } else if (user.role === "teacher") {
      if (session.teacherId !== user.id) {
        throw new ForbiddenError("Not your session");
      }
    } else if (user.role === "student") {
      if (!_enrolled) throw new ForbiddenError("Not enrolled in this course");
    } else if (user.role === "parent") {
      if (!_enrolled) throw new ForbiddenError("No linked child enrolled in this course");
    } else {
      // Terminal else (M-01): a role this chain does not name reads nothing.
      throw new ForbiddenError();
    }

    return session;
  });
}
