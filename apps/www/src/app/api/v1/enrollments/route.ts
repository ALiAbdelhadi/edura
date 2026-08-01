import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireSession } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { scopedDb } from "@/lib/db/scope";
import { ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { trackFirstStudent } from "@/lib/observability/funnel";
import { enrollStudent } from "@repo/server-core/services/center/enrollments";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await toActingUser(await requireSession());
  const url = new URL(req.url);

  const studentId = url.searchParams.get("studentId");
  const courseId = url.searchParams.get("courseId");
  const status = url.searchParams.get("status");

  const resolvedStudentId = studentId === "me" ? user.id : studentId;

  const enriched = await scopedDb(user, async (tx) => {
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
      // A ?courseId= filter must narrow within the teacher's own courses,
      // not be replaced by them (an off-scope courseId yields nothing).
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
      };
    });
  });

  return ok(enriched);
});

const createSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, createSchema);
  // Moved to the shared kernel with its guards intact: the three-level
  // blacklist gate, the center-roster block, the center-scope check and the
  // duplicate-enrollment conflict.
  const enrollment = await enrollStudent(user, body);
  // Funnel step 3. Attributed to the CENTER ACTOR who added them — the student
  // is the object of this event, never its subject, and no student id travels.
  await trackFirstStudent(user, user.centerId);
  return ok(enrollment, { status: 201 });
});
