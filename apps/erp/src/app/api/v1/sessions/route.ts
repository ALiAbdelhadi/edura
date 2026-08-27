import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { authorizeCenterActor } from "@/lib/authz/center-actor";
import { scopedDb } from "@/lib/db/scope";
import { ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import {
  approvedChildIds,
  assertApprovedChild,
} from "@/lib/services/wallet/parent-wallet";
import { enrichSessions } from "@/lib/services/sessions/enrich";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const user =
    session.role === "center_staff"
      ? (
          await authorizeCenterActor(session, {
            allow: ["receptionist", "manager", "center_accountant"],
          })
        ).acting
      : await toActingUser(session);

  const url = new URL(req.url);

  const courseId = url.searchParams.get("courseId");
  const teacherId = url.searchParams.get("teacherId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const studentIdParam = url.searchParams.get("studentId");

  const enriched = await scopedDb(user, async (tx) => {
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

    if (studentIdParam === "me" && user.role === "student") {
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: user.id, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    }

    const sessions = await tx.session.findMany({
      where,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return enrichSessions(tx, sessions);
  });

  return ok({ items: enriched });
});
