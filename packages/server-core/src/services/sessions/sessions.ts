import { Prisma } from "@repo/database";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { ForbiddenError, NotFoundError } from "../../errors/classes";
import { approvedChildIds, assertApprovedChild } from "../wallet/parent-wallet-facade";
import { enrichSessions } from "./enrich";

export type ListSessionsInput = {
  courseId: string | null;
  teacherId: string | null;
  from: string | null;
  to: string | null;
  studentId: string | null;
  limit?: number;
};

export function listSessionsForUser(user: SessionUser, input: ListSessionsInput) {
  const { courseId, teacherId, from, to, studentId: studentIdParam, limit } = input;

  return scopedDb(user, async (tx) => {
    const where: Prisma.SessionWhereInput = {};

    if (courseId) where.courseId = courseId;
    if (teacherId) where.teacherId = teacherId;
    if (from || to) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.date = dateFilter;
    }

    if (user.role === "center_admin") {
      const courses = await tx.course.findMany({
        where: { centerId: user.centerId as string },
        select: { id: true },
      });
      const centerCourseIds = courses.map((c) => c.id);
      if (courseId) {
        if (!centerCourseIds.includes(courseId)) {
          throw new ForbiddenError("Course not in your center");
        }
      } else {
        where.courseId = { in: centerCourseIds };
      }
    } else if (user.role === "teacher") {
      where.teacherId = user.id;
    } else if (user.role === "student") {
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: user.id, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    } else if (user.role === "parent") {
      let studentIds: string[];
      if (studentIdParam && studentIdParam !== "me") {
        await assertApprovedChild(tx, user.id, studentIdParam);
        studentIds = [studentIdParam];
      } else {
        studentIds = await approvedChildIds(tx, user.id);
        if (studentIds.length === 0) throw new ForbiddenError("No linked children");
      }
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: { in: studentIds }, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    } else {
      throw new ForbiddenError("This role has no session scope on this route");
    }

    const sessions = await tx.session.findMany({
      where,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      ...(limit ? { take: limit } : {}),
    });

    return enrichSessions(tx, sessions);
  });
}

export function getSessionForUser(user: SessionUser, id: string) {
  return scopedDb(user, async (tx) => {
    const session = await tx.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundError("Session not found");

    if (user.role === "center_admin") {
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true },
      });
      if (!course || course.centerId !== user.centerId) {
        throw new ForbiddenError("Session not in your center");
      }
    } else if (user.role === "teacher") {
      if (session.teacherId !== user.id) {
        throw new ForbiddenError("Not your session");
      }
    } else if (user.role === "student") {
      const enrollment = await tx.enrollment.findFirst({
        where: { courseId: session.courseId, studentId: user.id, status: "active" },
      });
      if (!enrollment) throw new ForbiddenError("Not enrolled in this course");
    } else if (user.role === "parent") {
      const links = await tx.parentStudentLink.findMany({
        where: { parentId: user.id, status: "approved" },
        select: { studentId: true },
      });
      const studentIds = links.map((l) => l.studentId);
      const enrollment = await tx.enrollment.findFirst({
        where: {
          courseId: session.courseId,
          studentId: { in: studentIds },
          status: "active",
        },
      });
      if (!enrollment) throw new ForbiddenError("No linked child enrolled in this course");
    } else {
      // Terminal else (M-01): a role this chain does not name reads nothing.
      throw new ForbiddenError();
    }

    return session;
  });
}
