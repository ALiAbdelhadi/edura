import { Prisma, type Course } from "@repo/database";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";

function withSchedulePattern<
  T extends {
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    startDate: Date;
    endDate: Date | null;
  },
>(course: T) {
  return {
    ...course,
    schedulePattern: {
      daysOfWeek: course.daysOfWeek,
      startTime: course.startTime,
      endTime: course.endTime,
      startDate: course.startDate,
      endDate: course.endDate,
    },
  };
}

const PUBLIC_BROWSE_CAP = 500;

export type CourseListFilters = {
  centerId: string | null;
  teacherId: string | null;
  subject: string | null;
  status: string | null;
  deliveryMode: string | null;
};

export const COURSE_COLUMNS = Prisma.sql`
  c.id, c.center_id AS "centerId", c.teacher_id AS "teacherId", c.default_room_id AS "defaultRoomId",
  c.title, c.subject, c.description, c.search_text AS "searchText", c.grade_tag AS "gradeTag",
  c.subject_id AS "subjectId", c.grade_level_id AS "gradeLevelId", c.track_id AS "trackId",
  coalesce(c.days_of_week, '{}') AS "daysOfWeek", c.start_time AS "startTime", c.end_time AS "endTime",
  c.start_date AS "startDate", c.end_date AS "endDate", c.price, c.price_per_month AS "pricePerMonth",
  c.price_per_session AS "pricePerSession", c.split_platform_bp AS "splitPlatformBp",
  c.split_teacher_bp AS "splitTeacherBp", c.split_center_bp AS "splitCenterBp",
  c.pricing_method AS "pricingMethod", c.m2_center_fee AS "m2CenterFee", c.m2_center_bp AS "m2CenterBp",
  c.settlement_basis AS "settlementBasis", c.delivery_mode AS "deliveryMode", c.online_url AS "onlineUrl",
  c.location, c.max_students AS "maxStudents", c.status, c.data_source AS "dataSource",
  c.is_demo AS "isDemo", c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;

type CourseListRow = Course & { _enrolled: number; _teacherName: string | null; _roomName: string | null };

export function listCourses(user: SessionUser | null, filters: CourseListFilters) {
  const {
    centerId: centerIdParam,
    teacherId: teacherIdParam,
    subject,
    status,
    deliveryMode,
  } = filters;

  return scopedDb(user, async (tx) => {
    const conds: Prisma.Sql[] = [];
    // Every other arm below scopes to courses the caller is already inside; the
    // centerId arm is the one a signed-out browser can reach, so it must not
    // carry the meeting link out with it.
    let publicBrowse = false;

    if (user?.role === "center_admin") {
      const centerId = user.centerId as string | null | undefined;
      if (centerId === null) conds.push(Prisma.sql`c.center_id IS NULL`);
      else if (centerId !== undefined) conds.push(Prisma.sql`c.center_id = ${centerId}::uuid`);
      if (teacherIdParam) conds.push(Prisma.sql`c.teacher_id = ${teacherIdParam}::uuid`);
    } else if (user?.role === "teacher") {
      conds.push(Prisma.sql`c.teacher_id = ${user.id}::uuid`);
    } else if (user?.role === "student") {
      conds.push(Prisma.sql`c.id IN (SELECT course_id FROM enrollments WHERE student_id = ${user.id}::uuid)`);
    } else if (user?.role === "parent") {
      conds.push(Prisma.sql`c.id IN (SELECT course_id FROM enrollments WHERE student_id IN (
        SELECT student_id FROM parent_student_links WHERE parent_id = ${user.id}::uuid AND status = 'approved'))`);
    } else if (centerIdParam) {
      conds.push(Prisma.sql`c.center_id = ${centerIdParam}::uuid`);
      publicBrowse = true;
    } else {
      return [];
    }

    if (subject) conds.push(Prisma.sql`c.subject = ${subject}`);
    if (deliveryMode) {
      if (!["onsite", "online", "hybrid"].includes(deliveryMode)) return [];
      conds.push(Prisma.sql`c.delivery_mode = ${deliveryMode}::course_delivery_mode`);
    }
    if (status) {
      if (!["active", "ended", "cancelled"].includes(status)) return [];
      conds.push(Prisma.sql`c.status = ${status}::course_status`);
    }

    const rows = await tx.$queryRaw<CourseListRow[]>`
      SELECT ${COURSE_COLUMNS},
             (SELECT count(*)::int FROM enrollments en
               WHERE en.course_id = c.id AND en.status = 'active') AS "_enrolled",
             (SELECT u.name FROM users u WHERE u.id = c.teacher_id AND u.deleted_at IS NULL) AS "_teacherName",
             (SELECT r.name FROM rooms r WHERE r.id = c.default_room_id) AS "_roomName"
        FROM courses c
       ${conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty}
       ${publicBrowse && !user ? Prisma.sql`ORDER BY c.id ASC LIMIT ${PUBLIC_BROWSE_CAP}` : Prisma.empty}`;

    return rows.map(({ _enrolled, _teacherName, _roomName, ...c }) => ({
      ...withSchedulePattern(c),
      onlineUrl: publicBrowse ? null : c.onlineUrl,
      hasOnlineUrl: !!c.onlineUrl,
      enrolledCount: _enrolled,
      enrolledStudentsCount: _enrolled,
      teacherName: _teacherName ?? "",
      roomName: _roomName ?? "",
    }));
  });
}
