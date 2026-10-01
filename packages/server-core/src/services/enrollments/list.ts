import { Prisma } from "@repo/database";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { ForbiddenError } from "../../errors/classes";

export type ListEnrollmentsInput = {
  courseId: string | null;
  status: string | null;
  studentId: string | null;
};

export function listEnrollmentsForUser(user: SessionUser, input: ListEnrollmentsInput) {
  const { courseId, status, studentId: resolvedStudentId } = input;

  return scopedDb(user, async (tx) => {
    const where: Prisma.EnrollmentWhereInput = {};
    if (courseId) where.courseId = courseId;
    if (status) where.status = status as Prisma.EnrollmentWhereInput["status"];

    if (user.role === "center_admin") {
      where.centerId = user.centerId;
      if (resolvedStudentId) where.studentId = resolvedStudentId;
    } else if (user.role === "student") {
      where.studentId = user.id;
    } else if (user.role === "parent") {
      if (resolvedStudentId) {
        const link = await tx.parentStudentLink.findFirst({
          where: { parentId: user.id, studentId: resolvedStudentId, status: "approved" },
        });
        if (!link) throw new ForbiddenError("Not linked to this student");
        where.studentId = resolvedStudentId;
      } else {
        const links = await tx.parentStudentLink.findMany({
          where: { parentId: user.id, status: "approved" },
          select: { studentId: true },
        });
        const studentIds = links.map((l) => l.studentId);
        if (studentIds.length === 0) return [];
        where.studentId = { in: studentIds };
      }
    } else if (user.role === "teacher") {
      const teacherCourses = await tx.course.findMany({
        where: { teacherId: user.id },
        select: { id: true },
      });
      const teacherCourseIds = teacherCourses.map((c) => c.id);
      where.courseId = courseId
        ? teacherCourseIds.includes(courseId)
          ? courseId
          : { in: [] }
        : { in: teacherCourseIds };
      if (resolvedStudentId) where.studentId = resolvedStudentId;
    } else {
      throw new ForbiddenError();
    }

    const enrollments = await tx.enrollment.findMany({ where });

    const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
    const courses = await tx.course.findMany({
      where: { id: { in: courseIds } },
      select: {
        id: true,
        title: true,
        subject: true,
        price: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        startDate: true,
        endDate: true,
      },
    });
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    const students = await tx.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true, email: true },
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const profiles = await tx.studentProfile.findMany({
      where: { userId: { in: studentIds } },
      select: { userId: true, studentCode: true },
    });
    const codeMap = new Map(profiles.map((p) => [p.userId, p.studentCode]));

    return enrollments.map((e) => {
      const c = courseMap.get(e.courseId);
      const s = studentMap.get(e.studentId);
      return {
        ...e,
        courseName: c?.title ?? "",
        subject: c?.subject ?? "",
        schedulePattern: c
          ? {
              daysOfWeek: c.daysOfWeek,
              startTime: c.startTime,
              endTime: c.endTime,
              startDate: c.startDate,
              endDate: c.endDate,
            }
          : null,
        coursePrice: c?.price ?? 0,
        studentName: s?.name ?? "",
        studentEmail: s?.email ?? "",
        studentCode: codeMap.get(e.studentId) ?? null,
      };
    });
  });
}
