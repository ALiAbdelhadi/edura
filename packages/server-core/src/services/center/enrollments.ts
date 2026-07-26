import { Prisma } from "@repo/database";
import { scopedDb, platformDb } from "../../db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ExpiredError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import { requireCenterScope } from "../../authz/center-scope";
import type { SessionUser } from "../../auth/types";
import { notify } from "../notifications/notify";
import { assertNotBlacklisted } from "../blacklist/blacklist";

// ---------------------------------------------------------------------------
// CENTER ENROLLMENTS + ENROLLMENT REQUESTS.
//
// Extracted verbatim from apps/www (enrollments/**, enrollment-requests/**).
// Same contract as the other center services: `acting` is center_admin-shaped
// and carries the TARGET centerId.
//
// MONEY: enrolling is a ROSTER operation. It writes no Payment, no
// Transaction, and no Subscription — coverage is a separate concern (Step 4),
// so a super admin enrolling a student is not the same as giving them paid
// access. Unenrolling likewise refunds nothing.
// ---------------------------------------------------------------------------

export async function listCenterEnrollments(
  acting: SessionUser,
  filters: { studentId?: string; courseId?: string; status?: string } = {},
) {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return scopedDb(acting, async (tx) => {
    const where: Prisma.EnrollmentWhereInput = { centerId: acting.centerId };
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.status) where.status = filters.status as Prisma.EnrollmentWhereInput["status"];

    const enrollments = await tx.enrollment.findMany({ where, orderBy: { enrolledAt: "desc" } });

    const courses = await tx.course.findMany({
      where: { id: { in: [...new Set(enrollments.map((e) => e.courseId))] } },
      select: { id: true, title: true, subject: true, price: true },
    });
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const students = await tx.user.findMany({
      where: { id: { in: [...new Set(enrollments.map((e) => e.studentId))] } },
      select: { id: true, name: true, email: true },
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));

    return enrollments.map((e) => ({
      ...e,
      courseName: courseMap.get(e.courseId)?.title ?? "",
      subject: courseMap.get(e.courseId)?.subject ?? "",
      coursePrice: courseMap.get(e.courseId)?.price ?? 0,
      studentName: studentMap.get(e.studentId)?.name ?? "",
      studentEmail: studentMap.get(e.studentId)?.email ?? "",
    }));
  });
}

export async function enrollStudent(
  acting: SessionUser,
  input: { studentId: string; courseId: string },
) {
  const { studentId, courseId } = input;

  // The blacklist gate runs BEFORE the scoped transaction, exactly as in www —
  // platform / center / teacher level, all three.
  const course0 = await platformDb((tx) =>
    tx.course.findUnique({ where: { id: courseId }, select: { centerId: true, teacherId: true } }),
  ).catch(() => null);
  if (course0) await assertNotBlacklisted(studentId, course0.centerId, course0.teacherId);

  const { enrollment, courseTitle } = await scopedDb(acting, async (tx) => {
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
    requireCenterScope(acting, course.centerId);

    const roster = await tx.centerStudentRoster.findFirst({
      where: { centerId: acting.centerId as string, studentId, leftAt: null },
    });
    if (roster?.blacklisted) {
      throw new BusinessRuleError("Student is blacklisted at this center");
    }

    const existing = await tx.enrollment.findFirst({
      where: { studentId, courseId, status: "active" },
    });
    if (existing) throw new ConflictError("Student already enrolled in this course");

    let created;
    try {
      created = await tx.enrollment.create({
        data: {
          studentId,
          courseId,
          centerId: acting.centerId as string,
          status: "active",
          enrolledAt: new Date(),
          // The REAL actor — for a super admin this records them, not the center.
          enrolledBy: acting.id,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("Student already enrolled in this course");
      }
      throw err;
    }

    return { enrollment: created, courseTitle: course.title };
  });

  await notify({
    recipients: [studentId],
    type: "enrollment_request_approved",
    title: "Enrolled in course",
    body: `You have been directly enrolled in "${courseTitle}".`,
    data: { courseId, enrollmentId: enrollment.id },
  });

  return enrollment;
}

/** Soft unenrol — the row survives with `unenrolledAt`, so history is intact. */
export async function unenrollStudent(acting: SessionUser, id: string) {
  return scopedDb(acting, async (tx) => {
    const enrollment = await tx.enrollment.findUnique({ where: { id } });
    if (!enrollment || enrollment.status !== "active") {
      throw new NotFoundError("Enrollment not found");
    }
    requireCenterScope(acting, enrollment.centerId);

    await tx.enrollment.update({
      where: { id },
      data: { status: "unenrolled", unenrolledAt: new Date() },
    });
    return { unenrolled: true as const, studentId: enrollment.studentId, courseId: enrollment.courseId };
  });
}

// ---------------------------------------------------------------------------
// Enrollment requests
// ---------------------------------------------------------------------------

export async function listEnrollmentRequests(
  acting: SessionUser,
  filters: { status?: string } = {},
) {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return scopedDb(acting, async (tx) => {
    const where: Prisma.EnrollmentRequestWhereInput = { centerId: acting.centerId };
    if (filters.status) {
      where.status = filters.status as Prisma.EnrollmentRequestWhereInput["status"];
    }
    const rows = await tx.enrollmentRequest.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: 200,
    });
    const courses = await tx.course.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } },
      select: { id: true, title: true },
    });
    const titleById = new Map(courses.map((c) => [c.id, c.title]));
    const students = await tx.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.studentId))] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(students.map((s) => [s.id, s.name]));
    return rows.map((r) => ({
      ...r,
      courseTitle: titleById.get(r.courseId) ?? null,
      studentName: nameById.get(r.studentId) ?? null,
    }));
  });
}

export async function approveEnrollmentRequest(acting: SessionUser, id: string) {
  const { request, courseTitle, studentId, courseId } = await scopedDb(acting, async (tx) => {
    const request = await tx.enrollmentRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Request not found");
    requireCenterScope(acting, request.centerId);

    if (request.status !== "pending") {
      throw new BusinessRuleError(`Request is already ${request.status}`);
    }
    if (request.expiresAt < new Date()) {
      await tx.enrollmentRequest.update({ where: { id }, data: { status: "expired" } });
      throw new ExpiredError("Enrollment request has expired");
    }

    const course = await tx.course.findUnique({ where: { id: request.courseId } });
    if (!course) throw new NotFoundError("Course not found");

    // Capacity is enforced here, unlike the H-04 blacklist restore which
    // deliberately wins over `maxStudents` (the seat was taken by a platform
    // action, not given up). A NEW approval has no such claim on the seat.
    const activeCount = await tx.enrollment.count({
      where: { courseId: request.courseId, status: "active" },
    });
    if (activeCount >= course.maxStudents) {
      throw new BusinessRuleError("Course is full", { code: "course_full" });
    }

    const alreadyEnrolled = await tx.enrollment.findFirst({
      where: { studentId: request.studentId, courseId: request.courseId, status: "active" },
    });
    if (alreadyEnrolled) throw new ConflictError("Student already enrolled");

    try {
      await tx.enrollment.create({
        data: {
          studentId: request.studentId,
          courseId: request.courseId,
          centerId: request.centerId,
          status: "active",
          enrolledAt: new Date(),
          enrolledBy: acting.id,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("Student already enrolled");
      }
      throw err;
    }

    const updated = await tx.enrollmentRequest.update({
      where: { id },
      data: { status: "approved", respondedAt: new Date(), respondedBy: acting.id },
    });

    return {
      request: updated,
      courseTitle: course.title,
      studentId: request.studentId,
      courseId: request.courseId,
    };
  });

  await notify({
    recipients: [studentId],
    type: "enrollment_request_approved",
    title: "Enrollment approved",
    body: `Your enrollment request for "${courseTitle}" has been approved.`,
    data: { courseId, requestId: id },
  });

  return { approved: true as const, ...request };
}

export async function declineEnrollmentRequest(
  acting: SessionUser,
  id: string,
  reason?: string,
) {
  const { studentId, courseId, courseTitle } = await scopedDb(acting, async (tx) => {
    const request = await tx.enrollmentRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Request not found");
    requireCenterScope(acting, request.centerId);

    if (request.status !== "pending") {
      throw new BusinessRuleError(`Request is already ${request.status}`);
    }

    await tx.enrollmentRequest.update({
      where: { id },
      data: {
        status: "declined",
        respondedAt: new Date(),
        respondedBy: acting.id,
        ...(reason ? { declineReason: reason } : {}),
      },
    });

    const course = await tx.course.findUnique({
      where: { id: request.courseId },
      select: { title: true },
    });

    return {
      studentId: request.studentId,
      courseId: request.courseId,
      courseTitle: course?.title ?? "the course",
    };
  });

  await notify({
    recipients: [studentId],
    type: "enrollment_request_declined",
    title: "Enrollment declined",
    body: `Your enrollment request for "${courseTitle}" has been declined.`,
    data: { courseId, requestId: id, reason },
  });

  return { declined: true as const };
}
