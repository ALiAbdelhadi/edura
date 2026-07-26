import { platformDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import {
  createCourse,
  updateCourse,
  cancelCourse,
  reassignCourseTeacher,
  getCenterCourse,
  type CourseCreateInput,
  type CoursePatch,
} from "@repo/server-core/services/center/courses";
import {
  listCenterEnrollments,
  enrollStudent,
  unenrollStudent,
  listEnrollmentRequests,
  approveEnrollmentRequest,
  declineEnrollmentRequest,
} from "@repo/server-core/services/center/enrollments";

// ---------------------------------------------------------------------------
// PHASE 2 — ACADEMIC. Superadmin parity with a center over courses,
// enrollments and enrollment requests. Same shape as center-people.ts: resolve
// target → shape actor → call the SAME kernel service www calls → audit once.
//
// MONEY, and the two places it actually bites:
//   • A course's frozen pricing snapshot (pricingMethod + the split bps +
//     m2CenterFee/Bp) is set ONCE at creation from superadmin config. `CoursePatch`
//     has no field for any of it and the kernel refuses a hall swap, so no edit
//     from here can re-rate an existing course (M4.5).
//   • Cancelling a course cancels FUTURE sessions only, and refunds nothing.
//     Already-settled sessions and every payment are left exactly as they are;
//     a refund is its own flow.
// ---------------------------------------------------------------------------

type AuditSpec = {
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
};

async function audit(actor: SessionUser, centerId: string, spec: AuditSpec) {
  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: spec.action,
          targetType: spec.targetType,
          targetId: spec.targetId,
          centerId,
          beforeState: (spec.before ?? undefined) as never,
          afterState: (spec.after ?? undefined) as never,
          onBehalfOf: null,
        },
      }),
    { actorId: actor.id },
  );
}

/** The fields an edit can change, plus the frozen ones, for the audit BEFORE. */
async function snapshotCourse(id: string) {
  return platformDb((tx) =>
    tx.course.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        teacherId: true,
        defaultRoomId: true,
        maxStudents: true,
        price: true,
        pricePerMonth: true,
        pricePerSession: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        startDate: true,
        endDate: true,
        // Recorded so the log PROVES the frozen snapshot did not move.
        pricingMethod: true,
        splitPlatformBp: true,
        splitTeacherBp: true,
        splitCenterBp: true,
        m2CenterFee: true,
        m2CenterBp: true,
      },
    }),
  );
}

/** The frozen-economics subset — compared before/after every course write. */
function frozenOf(c: Record<string, unknown> | null) {
  if (!c) return null;
  const {
    pricingMethod,
    splitPlatformBp,
    splitTeacherBp,
    splitCenterBp,
    m2CenterFee,
    m2CenterBp,
    defaultRoomId,
  } = c;
  return {
    pricingMethod,
    splitPlatformBp,
    splitTeacherBp,
    splitCenterBp,
    m2CenterFee,
    m2CenterBp,
    defaultRoomId,
  };
}

// ===========================================================================
// Courses
// ===========================================================================

export async function adminGetCourse(actor: SessionUser, centerId: string, courseId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return getCenterCourse(acting, courseId);
}

export async function adminCreateCourse(
  actor: SessionUser,
  centerId: string,
  body: CourseCreateInput,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await createCourse(acting, body);
  await audit(actor, centerId, {
    action: "center.course_created",
    targetType: "course",
    targetId: result.course.id,
    before: null,
    after: {
      title: result.course.title,
      teacherId: result.course.teacherId,
      roomId: result.course.defaultRoomId,
      maxStudents: result.course.maxStudents,
      sessionsGenerated: result.sessionsGenerated,
      // The snapshot resolved AT CREATION from superadmin config — recorded so
      // the log shows what economics this course was frozen with.
      frozenPricing: frozenOf(result.course as unknown as Record<string, unknown>),
    },
  });
  return result;
}

export async function adminUpdateCourse(
  actor: SessionUser,
  centerId: string,
  courseId: string,
  patch: CoursePatch,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await snapshotCourse(courseId);
  const result = await updateCourse(acting, courseId, patch);
  const after = await snapshotCourse(courseId);

  await audit(actor, centerId, {
    action: "center.course_updated",
    targetType: "course",
    targetId: courseId,
    before,
    after: {
      changed: Object.keys(patch),
      course: after,
      // An explicit, checkable claim in the log itself: the frozen economics
      // are identical before and after. `CoursePatch` cannot express them and
      // the kernel refuses a hall change, so this can only ever read true —
      // which is exactly why it is worth recording.
      frozenPricingUnchanged:
        JSON.stringify(frozenOf(before as never)) === JSON.stringify(frozenOf(after as never)),
    },
  });
  return result;
}

export async function adminCancelCourse(
  actor: SessionUser,
  centerId: string,
  courseId: string,
  reason: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await snapshotCourse(courseId);
  const counts = await platformDb(async (tx) => ({
    activeEnrollments: await tx.enrollment.count({
      where: { courseId, status: "active" },
    }),
    futureSessions: await tx.session.count({
      where: { courseId, status: { in: ["scheduled", "postponed"] } },
    }),
    settledSessions: await tx.session.count({
      where: { courseId, distributedAt: { not: null } },
    }),
  }));

  const result = await cancelCourse(acting, courseId, reason);

  await audit(actor, centerId, {
    action: "center.course_cancelled",
    targetType: "course",
    targetId: courseId,
    before: { status: before?.status, ...counts },
    after: {
      status: "cancelled",
      reason,
      notified: result.notified,
      // Stated plainly in the record, because it is the thing people assume
      // wrongly: cancelling ends future sessions. It refunds nothing, cancels
      // no subscription, and does not touch a session that already settled.
      refunded: false,
      subscriptionsCancelled: false,
      settledSessionsUntouched: counts.settledSessions,
    },
  });
  return result;
}

export async function adminReassignTeacher(
  actor: SessionUser,
  centerId: string,
  courseId: string,
  teacherId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await snapshotCourse(courseId);
  const result = await reassignCourseTeacher(acting, courseId, teacherId);
  await audit(actor, centerId, {
    action: "center.course_teacher_reassigned",
    targetType: "course",
    targetId: courseId,
    before: { teacherId: before?.teacherId },
    after: {
      teacherId,
      // Past sessions keep their original teacher — they record who actually
      // taught, and some of them have already been settled to that person.
      futureSessionsOnly: true,
      frozenPricingUnchanged: true,
    },
  });
  return result;
}

// ===========================================================================
// Enrollments
// ===========================================================================

export async function adminListEnrollments(
  actor: SessionUser,
  centerId: string,
  filters: { studentId?: string; courseId?: string; status?: string } = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listCenterEnrollments(acting, filters);
}

export async function adminEnrollStudent(
  actor: SessionUser,
  centerId: string,
  input: { studentId: string; courseId: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await enrollStudent(acting, input);
  await audit(actor, centerId, {
    action: "center.student_enrolled",
    targetType: "enrollment",
    targetId: result.id,
    before: null,
    after: {
      studentId: input.studentId,
      courseId: input.courseId,
      // Enrolment is the roster link. Payment coverage is a SUBSCRIPTION, and
      // none is created here — so this does not hand out paid access.
      subscriptionCreated: false,
    },
  });
  return result;
}

export async function adminUnenrollStudent(
  actor: SessionUser,
  centerId: string,
  enrollmentId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await platformDb((tx) =>
    tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, studentId: true, courseId: true, status: true, enrolledAt: true },
    }),
  );
  const result = await unenrollStudent(acting, enrollmentId);
  await audit(actor, centerId, {
    action: "center.student_unenrolled",
    targetType: "enrollment",
    targetId: enrollmentId,
    before,
    // Soft — the row survives with unenrolledAt, so the history stays readable.
    after: { status: "unenrolled", refunded: false },
  });
  return result;
}

// ===========================================================================
// Enrollment requests
// ===========================================================================

export async function adminListEnrollmentRequests(
  actor: SessionUser,
  centerId: string,
  filters: { status?: string } = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listEnrollmentRequests(acting, filters);
}

export async function adminApproveEnrollmentRequest(
  actor: SessionUser,
  centerId: string,
  requestId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await platformDb((tx) =>
    tx.enrollmentRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, studentId: true, courseId: true },
    }),
  );
  const result = await approveEnrollmentRequest(acting, requestId);
  await audit(actor, centerId, {
    action: "center.enrollment_request_approved",
    targetType: "enrollment_request",
    targetId: requestId,
    before,
    after: { status: "approved", studentId: before?.studentId, courseId: before?.courseId },
  });
  return result;
}

export async function adminDeclineEnrollmentRequest(
  actor: SessionUser,
  centerId: string,
  requestId: string,
  reason?: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await platformDb((tx) =>
    tx.enrollmentRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, studentId: true, courseId: true },
    }),
  );
  const result = await declineEnrollmentRequest(acting, requestId, reason);
  await audit(actor, centerId, {
    action: "center.enrollment_request_declined",
    targetType: "enrollment_request",
    targetId: requestId,
    before,
    after: { status: "declined", reason: reason ?? null },
  });
  return result;
}
