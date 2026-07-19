import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { scopedDb } from "@/lib/db/scope";
import { ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await toActingUser(await requireSession());

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
      const links = await tx.parentStudentLink.findMany({
        where: { parentId: user.id, status: "approved" },
        select: { studentId: true },
      });
      const studentIds = links.map((l) => l.studentId);
      if (studentIds.length === 0) throw new ForbiddenError("No linked children");
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: { in: studentIds }, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
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

    const courseIds = [...new Set(sessions.map((s) => s.courseId))];
    const teacherIds = [...new Set(sessions.map((s) => s.teacherId).filter(Boolean))];
    const roomIds = [
      ...new Set(sessions.map((s) => s.roomId).filter(Boolean) as string[]),
    ];

    const [courses, teachers, rooms] = await Promise.all([
      tx.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true, subject: true },
      }),
      tx.user.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, name: true },
      }),
      tx.room.findMany({
        where: { id: { in: roomIds } },
        select: { id: true, name: true },
      }),
    ]);
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));

    return sessions.map((s) => {
      const c = courseMap.get(s.courseId);
      const t = teacherMap.get(s.teacherId);
      const r = s.roomId ? roomMap.get(s.roomId) : null;
      return {
        ...s,
        courseName: c?.title ?? "",
        subject: c?.subject ?? "",
        teacherName: t?.name ?? "",
        roomName: r?.name ?? "",
      };
    });
  });

  return ok({ items: enriched });
});
