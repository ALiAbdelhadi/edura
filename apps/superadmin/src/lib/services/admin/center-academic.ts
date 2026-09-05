import { scopedDb, type TenantTx } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import {
  createCourseTx,
  updateCourseTx,
  cancelCourseTx,
  reassignCourseTeacherTx,
  getCenterCourse,
  type CourseCreateInput,
  type CoursePatch,
} from "@repo/server-core/services/center/courses";
import { runEffects } from "@repo/server-core/db/effects";
import { writeAdminAudit } from "@/lib/services/admin/admin-audit";
import {
  listCenterEnrollments,
  enrollStudentTx,
  unenrollStudentTx,
  listEnrollmentRequests,
  approveEnrollmentRequestTx,
  declineEnrollmentRequestTx,
} from "@repo/server-core/services/center/enrollments";

// Reads on the caller's own transaction: an `after` snapshot taken on a separate
// connection would still see the pre-write row and quietly record a wrong audit.
function courseSnapshot(tx: TenantTx, id: string) {
  return tx.course.findUnique({
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
      pricingMethod: true,
      splitPlatformBp: true,
      splitTeacherBp: true,
      splitCenterBp: true,
      m2CenterFee: true,
      m2CenterBp: true,
    },
  });
}

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
  return scopedDb(acting, async (tx) => {
    const result = await createCourseTx(tx, acting, body);
    await writeAdminAudit(tx, actor, {
      action: "center.course_created",
      targetType: "course",
      targetId: result.course.id,
      centerId,
      before: null,
      after: {
        title: result.course.title,
        teacherId: result.course.teacherId,
        roomId: result.course.defaultRoomId,
        maxStudents: result.course.maxStudents,
        sessionsGenerated: result.sessionsGenerated,
        frozenPricing: frozenOf(result.course as unknown as Record<string, unknown>),
      },
    });
    return result;
  });
}

export async function adminUpdateCourse(
  actor: SessionUser,
  centerId: string,
  courseId: string,
  patch: CoursePatch,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await courseSnapshot(tx, courseId);
    const result = await updateCourseTx(tx, acting, courseId, patch);
    const after = await courseSnapshot(tx, courseId);

    await writeAdminAudit(tx, actor, {
      action: "center.course_updated",
      targetType: "course",
      targetId: courseId,
      centerId,
      before,
      after: {
        changed: Object.keys(patch),
        course: after,
        frozenPricingUnchanged:
          JSON.stringify(frozenOf(before as never)) === JSON.stringify(frozenOf(after as never)),
      },
    });
    return result;
  });
}

export async function adminCancelCourse(
  actor: SessionUser,
  centerId: string,
  courseId: string,
  reason: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const before = await courseSnapshot(tx, courseId);
    const counts = {
      activeEnrollments: await tx.enrollment.count({
        where: { courseId, status: "active" },
      }),
      futureSessions: await tx.session.count({
        where: { courseId, status: { in: ["scheduled", "postponed"] } },
      }),
      settledSessions: await tx.session.count({
        where: { courseId, distributedAt: { not: null } },
      }),
    };

    const outcome = await cancelCourseTx(tx, acting, courseId, reason);

    await writeAdminAudit(tx, actor, {
      action: "center.course_cancelled",
      targetType: "course",
      targetId: courseId,
      centerId,
      before: { status: before?.status, ...counts },
      after: {
        status: "cancelled",
        reason,
        notified: outcome.value.notified,
        refunded: false,
        subscriptionsCancelled: false,
        settledSessionsUntouched: counts.settledSessions,
      },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminReassignTeacher(
  actor: SessionUser,
  centerId: string,
  courseId: string,
  teacherId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await courseSnapshot(tx, courseId);
    const result = await reassignCourseTeacherTx(tx, acting, courseId, teacherId);
    await writeAdminAudit(tx, actor, {
      action: "center.course_teacher_reassigned",
      targetType: "course",
      targetId: courseId,
      centerId,
      before: { teacherId: before?.teacherId },
      after: {
        teacherId,
        futureSessionsOnly: true,
        frozenPricingUnchanged: true,
      },
    });
    return result;
  });
}

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
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const outcome = await enrollStudentTx(tx, acting, input);
    await writeAdminAudit(tx, actor, {
      action: "center.student_enrolled",
      targetType: "enrollment",
      targetId: outcome.value.id,
      centerId,
      before: null,
      after: {
        studentId: input.studentId,
        courseId: input.courseId,
        subscriptionCreated: false,
      },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminUnenrollStudent(
  actor: SessionUser,
  centerId: string,
  enrollmentId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, studentId: true, courseId: true, status: true, enrolledAt: true },
    });
    const result = await unenrollStudentTx(tx, acting, enrollmentId);
    await writeAdminAudit(tx, actor, {
      action: "center.student_unenrolled",
      targetType: "enrollment",
      targetId: enrollmentId,
      centerId,
      before,
      after: { status: "unenrolled", refunded: false },
    });
    return result;
  });
}

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
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const before = await tx.enrollmentRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, studentId: true, courseId: true },
    });
    const outcome = await approveEnrollmentRequestTx(tx, acting, requestId);
    await writeAdminAudit(tx, actor, {
      action: "center.enrollment_request_approved",
      targetType: "enrollment_request",
      targetId: requestId,
      centerId,
      before,
      after: { status: "approved", studentId: before?.studentId, courseId: before?.courseId },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminDeclineEnrollmentRequest(
  actor: SessionUser,
  centerId: string,
  requestId: string,
  reason?: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const before = await tx.enrollmentRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, studentId: true, courseId: true },
    });
    const outcome = await declineEnrollmentRequestTx(tx, acting, requestId, reason);
    await writeAdminAudit(tx, actor, {
      action: "center.enrollment_request_declined",
      targetType: "enrollment_request",
      targetId: requestId,
      centerId,
      before,
      after: { status: "declined", reason: reason ?? null },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}
