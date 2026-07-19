import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireSession } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb, platformDb } from "@/lib/db/scope";
import { NotFoundError, ForbiddenError, ConflictError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { notify } from "@/lib/services/notifications/notify";
import { assertNotBlacklisted } from "@/lib/services/blacklist/blacklist";

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
  const { studentId, courseId } = await parseJson(req, createSchema);

  const course0 = await platformDb((tx) =>
    tx.course.findUnique({ where: { id: courseId }, select: { centerId: true, teacherId: true } }),
  ).catch(() => null);
  if (course0) await assertNotBlacklisted(studentId, course0.centerId, course0.teacherId);

  const { enrollment, courseTitle } = await scopedDb(user, async (tx) => {
    let course;
    try {
      course = await tx.course.findUnique({ where: { id: courseId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2023") {
        throw new NotFoundError("Course not found");
      }
      throw err;
    }
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(user, course.centerId);

    const roster = await tx.centerStudentRoster.findFirst({
      where: { centerId: user.centerId as string, studentId, leftAt: null },
    });
    if (roster?.blacklisted) {
      throw new BusinessRuleError("Student is blacklisted at this center");
    }

    const existing = await tx.enrollment.findFirst({
      where: { studentId, courseId, status: "active" },
    });
    if (existing) throw new ConflictError("Student already enrolled in this course");

    let enrollment;
    try {
      enrollment = await tx.enrollment.create({
        data: {
          studentId,
          courseId,
          centerId: user.centerId as string,
          status: "active",
          enrolledAt: new Date(),
          enrolledBy: user.id,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("Student already enrolled in this course");
      }
      throw err;
    }

    return { enrollment, courseTitle: course.title };
  });

  await notify({
    recipients: [studentId],
    type: "enrollment_request_approved",
    title: "Enrolled in course",
    body: `You have been directly enrolled in "${courseTitle}".`,
    data: { courseId, enrollmentId: enrollment.id },
  });

  return ok(enrollment, { status: 201 });
});
