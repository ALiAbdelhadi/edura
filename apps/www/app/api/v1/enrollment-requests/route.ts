import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { getSessionUser } from "@/lib/auth/session";
import { scopedDb, platformDb } from "@/lib/db/scope";
import { ForbiddenError, ConflictError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { notify } from "@/lib/services/notifications/notify";
import { assertNotBlacklisted } from "@/lib/services/blacklist/blacklist";

export const dynamic = "force-dynamic";

const EXPIRY_DAYS = 14;

export const GET = withErrors(async (req) => {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Not authenticated");
  const url = new URL(req.url);

  const courseId = url.searchParams.get("courseId");
  const studentId = url.searchParams.get("studentId");
  const status = url.searchParams.get("status");

  const enriched = await scopedDb(user, async (tx) => {
    const where: Prisma.EnrollmentRequestWhereInput = {};
    if (courseId) where.courseId = courseId;
    if (status) where.status = status as Prisma.EnrollmentRequestWhereInput["status"];

    if (user.role === "center_admin") {
      where.centerId = user.centerId;
      if (studentId) where.studentId = studentId;
    } else if (user.role === "student") {
      where.studentId = user.id;
    } else {
      throw new ForbiddenError();
    }

    const requests = await tx.enrollmentRequest.findMany({ where });

    // Lazy expiry
    const now = new Date();
    const expiredIds = requests
      .filter((r) => r.status === "pending" && r.expiresAt < now)
      .map((r) => r.id);
    if (expiredIds.length > 0) {
      await tx.enrollmentRequest.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: "expired" },
      });
    }
    const expiredSet = new Set(expiredIds);

    // Resolve the previously-populated studentId/courseId refs.
    const studentIds = [...new Set(requests.map((r) => r.studentId))];
    const courseIds = [...new Set(requests.map((r) => r.courseId))];
    const [students, courses] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, email: true },
      }),
      tx.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      }),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    return requests.map((r) => {
      const s = studentMap.get(r.studentId);
      const c = courseMap.get(r.courseId);
      return {
        ...r,
        status: expiredSet.has(r.id) ? "expired" : r.status,
        studentId: s ? { id: s.id, name: s.name, email: s.email } : r.studentId,
        courseId: c ? { id: c.id, title: c.title } : r.courseId,
      };
    });
  });

  return ok(enriched);
});

const createSchema = z.object({
  courseId: z.string().min(1),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("student");
  const { courseId } = await parseJson(req, createSchema);

  // Blacklist enforcement across all levels (platform/center/teacher), run
  // before the scoped block so it can see platform + teacher entries.
  const course0 = await platformDb((tx) =>
    tx.course.findUnique({ where: { id: courseId }, select: { centerId: true, teacherId: true } }),
  ).catch(() => null);
  if (course0) await assertNotBlacklisted(user.id, course0.centerId, course0.teacherId);

  const { request, courseTitle, adminIds } = await scopedDb(user, async (tx) => {
    let course;
    try {
      course = await tx.course.findUnique({ where: { id: courseId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2023") {
        throw new ForbiddenError("Course not found");
      }
      throw err;
    }
    if (!course) throw new ForbiddenError("Course not found");

    // Check blacklist — silent 403, no reason disclosed
    const roster = await tx.centerStudentRoster.findFirst({
      where: { centerId: course.centerId, studentId: user.id, leftAt: null },
    });
    if (roster?.blacklisted) throw new ForbiddenError("You cannot request enrollment in this course");

    // Check for existing pending request
    const existing = await tx.enrollmentRequest.findFirst({
      where: { studentId: user.id, courseId, status: "pending" },
    });
    if (existing) throw new ConflictError("Enrollment request already pending");

    // Check if already actively enrolled
    const alreadyEnrolled = await tx.enrollment.findFirst({
      where: { studentId: user.id, courseId, status: "active" },
    });
    if (alreadyEnrolled) throw new ConflictError("Already enrolled in this course");

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const request = await tx.enrollmentRequest.create({
      data: {
        studentId: user.id,
        courseId,
        centerId: course.centerId,
        submittedAt: new Date(),
        expiresAt,
      },
    });

    const adminProfiles = await tx.centerAdminProfile.findMany({
      where: { centerId: course.centerId },
      select: { userId: true },
    });

    return {
      request,
      courseTitle: course.title,
      adminIds: adminProfiles.map((a) => a.userId),
    };
  });

  // Notify all center admins
  await notify({
    recipients: adminIds,
    type: "enrollment_request_submitted",
    title: "New enrollment request",
    body: `A student has requested to enroll in "${courseTitle}".`,
    data: { courseId, requestId: request.id },
  });

  return ok(request, { status: 201 });
});
