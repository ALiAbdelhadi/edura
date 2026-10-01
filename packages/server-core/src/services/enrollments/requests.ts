import { Prisma } from "@repo/database";
import { scopedDb, platformDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import {
  ForbiddenError,
  ConflictError,
  BusinessRuleError,
  NotFoundError,
} from "../../errors/classes";
import { notify } from "../notifications/notify";
import { assertNotBlacklisted } from "../blacklist/blacklist";

const EXPIRY_DAYS = 14;

export type ListEnrollmentRequestsInput = {
  courseId: string | null;
  studentId: string | null;
  status: string | null;
};

export function listEnrollmentRequestsForUser(
  user: SessionUser,
  input: ListEnrollmentRequestsInput,
) {
  const { courseId, studentId, status } = input;

  return scopedDb(user, async (tx) => {
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
}

export async function createEnrollmentRequest(user: SessionUser, courseId: string) {
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
    if (!course.centerId) {
      throw new BusinessRuleError("This course is joined by subscription, not enrollment request");
    }
    const centerId = course.centerId;

    const roster = await tx.centerStudentRoster.findFirst({
      where: { centerId, studentId: user.id, leftAt: null },
    });
    if (roster?.blacklisted) throw new ForbiddenError("You cannot request enrollment in this course");

    const existing = await tx.enrollmentRequest.findFirst({
      where: { studentId: user.id, courseId, status: "pending" },
    });
    if (existing) throw new ConflictError("Enrollment request already pending");

    const alreadyEnrolled = await tx.enrollment.findFirst({
      where: { studentId: user.id, courseId, status: "active" },
    });
    if (alreadyEnrolled) throw new ConflictError("Already enrolled in this course");

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const request = await tx.enrollmentRequest.create({
      data: {
        studentId: user.id,
        courseId,
        centerId,
        submittedAt: new Date(),
        expiresAt,
      },
    });

    const adminProfiles = await tx.centerAdminProfile.findMany({
      where: { centerId },
      select: { userId: true },
    });

    return {
      request,
      courseTitle: course.title,
      adminIds: adminProfiles.map((a) => a.userId),
    };
  });

  await notify({
    recipients: adminIds,
    type: "enrollment_request_submitted",
    title: "New enrollment request",
    body: `A student has requested to enroll in "${courseTitle}".`,
    data: { courseId, requestId: request.id },
  });

  return request;
}

export function cancelEnrollmentRequest(user: SessionUser, id: string) {
  return scopedDb(user, async (tx) => {
    const request = await tx.enrollmentRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Request not found");
    if (request.studentId !== user.id) throw new ForbiddenError();
    if (request.status !== "pending") {
      throw new BusinessRuleError("Only pending requests can be cancelled");
    }

    await tx.enrollmentRequest.update({ where: { id }, data: { status: "cancelled" } });
  });
}
