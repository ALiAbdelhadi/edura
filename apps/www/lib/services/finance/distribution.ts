import { platformDb, type TenantTx } from "@/lib/db/scope";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { awardPoints } from "@/lib/services/points/points";
import { nextTxnRef } from "@/lib/services/finance/refNumbers";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Money-distribution engine (PRD §5.1), reconciled to Edura's Course→Session model.
 *
 * PRD is a per-lesson marketplace; Edura prices per COURSE and runs recurring
 * SESSIONS. Reconciliation decisions (flagged for business confirmation in
 * docs/API_Audit_Changelog — money logic is owner-owned):
 *   - A "booked lesson" = one PRESENT student in a completed Session.
 *   - lessonPrice (per present student) = round(course.price / plannedSessions).
 *   - centerShare (per lesson) = the active CenterTeacherAffiliation.centerShare
 *     for (center, teacher), default 0.
 *   - Platform earns EGP 2 from teacher + EGP 2 from center per booked lesson
 *     (200 + 200 piasters), EXACTLY per PRD §5.1 — not "fixed".
 *
 * All amounts are integer piasters. Transactions are append-only (immutable
 * ledger); corrections happen via reversal inserts, never edits.
 */
export const PLATFORM_TEACHER_FEE = 200; // 2 EGP
export const PLATFORM_CENTER_FEE = 200; // 2 EGP

/**
 * Pure fee split for ONE booked lesson (PRD §5.1, §0 monetization). All values
 * integer piasters. Extracted for unit testing on real example numbers.
 *
 *   teacher_net  = lesson_price − 2 EGP (platform) − center_share
 *   center_net   = center_share − 2 EGP (platform)
 *   platform_net = 2 EGP + 2 EGP = 4 EGP
 */
export function computeLessonSplit(lessonPrice: number, centerShare: number) {
  return {
    teacherNet: lessonPrice - PLATFORM_TEACHER_FEE - centerShare,
    centerNet: centerShare - PLATFORM_CENTER_FEE,
    platformNet: PLATFORM_TEACHER_FEE + PLATFORM_CENTER_FEE,
  };
}

type Distribution = {
  distributed: boolean;
  reason?: string;
  presentCount?: number;
  perSessionPrice?: number;
  centerShare?: number;
  teacherNetTotal?: number;
  centerNetTotal?: number;
  platformEarned?: number;
};

/**
 * Distribute revenue for a session already known to be completed. MUST run
 * inside a platform-context transaction. Idempotent: if commission transactions
 * already exist for this session, it does nothing.
 */
export async function distributeSessionRevenue(
  tx: TenantTx,
  sessionId: string,
): Promise<Distribution> {
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");

  const course = await tx.course.findUnique({ where: { id: session.courseId } });
  if (!course) throw new NotFoundError("Course not found");
  const centerId = course.centerId;
  const teacherId = course.teacherId;

  const present = await tx.attendanceRecord.findMany({
    where: { sessionId, status: "present" },
    select: { studentId: true },
  });
  // No revenue without attendance — return WITHOUT claiming, so a retry after
  // attendance is marked can still distribute.
  if (present.length === 0) return { distributed: false, reason: "no_present_students" };

  // Idempotency guard — atomically CLAIM the session for distribution. The
  // guarded updateMany takes a row lock; a concurrent completeSession blocks
  // here, then sees distributed_at already set and matches 0 rows. Exactly one
  // caller ever distributes a given session. (Replaces the previous app-layer
  // findFirst check, which two concurrent transactions could both pass.)
  const claim = await tx.session.updateMany({
    where: { id: sessionId, distributedAt: null },
    data: { distributedAt: new Date() },
  });
  if (claim.count === 0) return { distributed: false, reason: "already_distributed" };

  const plannedSessions = await tx.session.count({ where: { courseId: course.id } });
  const perSessionPrice =
    plannedSessions > 0 ? Math.round(course.price / plannedSessions) : course.price;

  const affiliation = await tx.centerTeacherAffiliation.findFirst({
    where: { centerId, teacherId, status: "active" },
    select: { centerShare: true },
  });
  const centerShare = affiliation?.centerShare ?? 0;

  // Race-free ledger reference numbers (Postgres sequence, not count()).
  const mkRef = () => nextTxnRef(tx);

  const { teacherNet, centerNet } = computeLessonSplit(perSessionPrice, centerShare);

  const rows: Parameters<TenantTx["transaction"]["createMany"]>[0]["data"] = [];
  for (const { studentId } of present) {
    const [paymentRef, teacherFeeRef, centerFeeRef] = [
      await mkRef(),
      await mkRef(),
      await mkRef(),
    ];
    rows.push(
      {
        refNumber: paymentRef,
        type: "payment",
        amount: perSessionPrice,
        fromEntityId: studentId,
        toEntityId: centerId,
        centerId,
        lessonId: sessionId,
        status: "completed",
        notes: "Lesson revenue",
      },
      {
        refNumber: teacherFeeRef,
        type: "commission",
        amount: PLATFORM_TEACHER_FEE,
        fromEntityId: teacherId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        notes: "Platform fee (teacher side)",
      },
      {
        refNumber: centerFeeRef,
        type: "commission",
        amount: PLATFORM_CENTER_FEE,
        fromEntityId: centerId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        notes: "Platform fee (center side)",
      },
    );
    // Engagement points for attending (PRD §5.7).
    await awardPoints(tx, studentId, "attendance", { reason: "Attended a lesson" });
  }

  await tx.transaction.createMany({ data: rows });

  const teacherNetTotal = teacherNet * present.length;
  const centerNetTotal = centerNet * present.length;
  if (teacherNetTotal !== 0) {
    await tx.teacherProfile.updateMany({
      where: { userId: teacherId },
      data: { walletBalance: { increment: teacherNetTotal } },
    });
  }
  if (centerNetTotal !== 0) {
    await tx.center.update({
      where: { id: centerId },
      data: { walletBalance: { increment: centerNetTotal } },
    });
  }

  return {
    distributed: true,
    presentCount: present.length,
    perSessionPrice,
    centerShare,
    teacherNetTotal,
    centerNetTotal,
    platformEarned: present.length * (PLATFORM_TEACHER_FEE + PLATFORM_CENTER_FEE),
  };
}

/**
 * Mark a session completed and distribute its revenue. Authorized for the
 * session's own teacher or a center_admin of the session's center.
 */
export async function completeSession(sessionId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError("Session not found");

      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true, teacherId: true },
      });
      if (!course) throw new NotFoundError("Course not found");

      if (user.role === "teacher") {
        if (session.teacherId !== user.id) {
          throw new ForbiddenError("Only the session's teacher can complete it");
        }
      } else if (user.role === "center_admin") {
        if (course.centerId !== user.centerId) {
          throw new ForbiddenError("Session belongs to a different center");
        }
      } else {
        throw new ForbiddenError();
      }

      if (session.status === "cancelled") {
        throw new BusinessRuleError("A cancelled session cannot be completed");
      }

      const wasCompleted = session.status === "completed";
      const updated = wasCompleted
        ? session
        : await tx.session.update({
            where: { id: sessionId },
            data: { status: "completed", editedAt: new Date() },
          });

      // Distribute (idempotent — safe even if the session was already completed).
      const distribution = await distributeSessionRevenue(tx, sessionId);
      return { session: updated, distribution };
    },
    { actorId: user.id },
  );
}
