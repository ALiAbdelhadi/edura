import type { Prisma } from "@repo/database";
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

export function listCourses(user: SessionUser | null, filters: CourseListFilters) {
  const {
    centerId: centerIdParam,
    teacherId: teacherIdParam,
    subject,
    status,
    deliveryMode,
  } = filters;

  return scopedDb(user, async (tx) => {
    const where: Prisma.CourseWhereInput = {};
    // Every other arm below scopes to courses the caller is already inside; the
    // centerId arm is the one a signed-out browser can reach, so it must not
    // carry the meeting link out with it.
    let publicBrowse = false;

    if (user?.role === "center_admin") {
      where.centerId = user.centerId;
      if (teacherIdParam) where.teacherId = teacherIdParam;
    } else if (user?.role === "teacher") {
      where.teacherId = user.id;
    } else if (user?.role === "student") {
      const enr = await tx.enrollment.findMany({
        where: { studentId: user.id },
        select: { courseId: true },
      });
      where.id = { in: enr.map((e) => e.courseId) };
    } else if (user?.role === "parent") {
      const links = await tx.parentStudentLink.findMany({
        where: { parentId: user.id, status: "approved" },
        select: { studentId: true },
      });
      const childIds = links.map((l) => l.studentId);
      const enr = childIds.length
        ? await tx.enrollment.findMany({
          where: { studentId: { in: childIds } },
          select: { courseId: true },
        })
        : [];
      where.id = { in: enr.map((e) => e.courseId) };
    } else if (centerIdParam) {
      where.centerId = centerIdParam;
      publicBrowse = true;
    } else {
      return [];
    }

    if (subject) where.subject = subject;
    if (deliveryMode) {
      if (!["onsite", "online", "hybrid"].includes(deliveryMode)) return [];
      where.deliveryMode = deliveryMode as Prisma.CourseWhereInput["deliveryMode"];
    }
    if (status) {
      if (!["active", "ended", "cancelled"].includes(status)) return [];
      where.status = status as Prisma.CourseWhereInput["status"];
    }

    const courses = await tx.course.findMany({
      where,
      ...(publicBrowse && !user ? { take: PUBLIC_BROWSE_CAP } : {}),
    });

    const courseIds = courses.map((c) => c.id);
    const teacherIds = [...new Set(courses.map((c) => c.teacherId).filter(Boolean))];
    const roomIds = [
      ...new Set(courses.map((c) => c.defaultRoomId).filter(Boolean) as string[]),
    ];

    const [counts, teachers, rooms] = await Promise.all([
      tx.enrollment.groupBy({
        by: ["courseId"],
        where: { courseId: { in: courseIds }, status: "active" },
        _count: { _all: true },
      }),
      tx.user.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, name: true, email: true },
      }),
      tx.room.findMany({
        where: { id: { in: roomIds } },
        select: { id: true, name: true },
      }),
    ]);
    const countMap = new Map(counts.map((c) => [c.courseId, c._count._all]));
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));

    return courses.map((c) => {
      const enrolled = countMap.get(c.id) ?? 0;
      const t = teacherMap.get(c.teacherId);
      const r = c.defaultRoomId ? roomMap.get(c.defaultRoomId) : null;
      return {
        ...withSchedulePattern(c),
        onlineUrl: publicBrowse ? null : c.onlineUrl,
        hasOnlineUrl: !!c.onlineUrl,
        enrolledCount: enrolled,
        enrolledStudentsCount: enrolled,
        teacherName: t?.name ?? "",
        roomName: r?.name ?? "",
      };
    });
  });
}
