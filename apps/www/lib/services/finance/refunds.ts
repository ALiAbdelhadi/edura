import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";
import { nextTxnRefs } from "@/lib/services/finance/refNumbers";
import { PLATFORM_TEACHER_FEE, PLATFORM_CENTER_FEE } from "@/lib/services/finance/distribution";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Refund / reversal (PRD §3.3, §4.3). The transaction ledger is append-only, so
 * a refund is NEVER an edit of the original rows — it is a set of COMPENSATING
 * entries that reference the originals via `reversal_of_id`. After a refund the
 * ledger nets to zero for that (session, student):
 *
 *   original distribution        reversal
 *   ─────────────────────        ────────────────────────────────
 *   payment  student→center  P   refund     center→student   P   (reversal_of = payment)
 *   commission teacher→∅    200   adjustment ∅→teacher      200   (return platform fee)
 *   commission center→∅     200   adjustment ∅→center       200   (return platform fee)
 *   wallet  teacher +tNet        wallet  teacher −tNet
 *   wallet  center  +cNet        wallet  center  −cNet
 *
 *   where P = perSessionPrice (the student's ACTUAL charge, read from the stored
 *   payment row — drift-proof), tNet = P − 200 − centerShare, cNet = centerShare
 *   − 200. tNet + cNet + 400 = P, so the student is made exactly whole.
 *
 * Idempotent: refuses if a refund already references the student's payment row.
 * Debiting a wallet may drive it negative if the beneficiary was already paid
 * out — that is intended; it reduces their next payout (openPayoutSum nets it).
 */
export async function refundLessonForStudent(
  sessionId: string,
  studentId: string,
  reason: string,
  user: SessionUser,
) {
  if (!reason?.trim()) throw new BusinessRuleError("A refund reason is required");

  const outcome = await platformDb(
    async (tx: TenantTx) => {
      // The student's charge for this lesson.
      const payment = await tx.transaction.findFirst({
        where: { lessonId: sessionId, fromEntityId: studentId, type: "payment", status: "completed" },
        orderBy: { createdAt: "asc" },
      });
      if (!payment) throw new NotFoundError("No completed charge found for this student and lesson");

      // Idempotency — one refund per charge.
      const already = await tx.transaction.findFirst({
        where: { reversalOfId: payment.id, type: "refund" },
        select: { id: true },
      });
      if (already) throw new BusinessRuleError("This lesson charge has already been refunded");

      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError("Session not found");
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true, teacherId: true },
      });
      if (!course) throw new NotFoundError("Course not found");
      const { centerId, teacherId } = course;

      const perSessionPrice = payment.amount;
      const affiliation = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId, teacherId, status: "active" },
        select: { centerShare: true },
      });
      const centerShare = affiliation?.centerShare ?? 0;
      const teacherNet = perSessionPrice - PLATFORM_TEACHER_FEE - centerShare;
      const centerNet = centerShare - PLATFORM_CENTER_FEE;

      // Compensating ledger rows (append-only; originals untouched). Three refs
      // in one round-trip.
      const [refundRef, teacherAdjRef, centerAdjRef] = await nextTxnRefs(tx, 3);
      await tx.transaction.createMany({
        data: [
          {
            refNumber: refundRef,
            type: "refund",
            amount: perSessionPrice,
            fromEntityId: centerId,
            toEntityId: studentId,
            centerId,
            lessonId: sessionId,
            status: "completed",
            reversalOfId: payment.id,
            notes: `Refund: ${reason}`,
          },
          // Return the platform's 2+2 EGP fee so the ledger nets to zero.
          {
            refNumber: teacherAdjRef,
            type: "adjustment",
            amount: PLATFORM_TEACHER_FEE,
            toEntityId: teacherId,
            centerId,
            lessonId: sessionId,
            status: "completed",
            notes: `Platform fee returned (teacher side) — refund: ${reason}`,
          },
          {
            refNumber: centerAdjRef,
            type: "adjustment",
            amount: PLATFORM_CENTER_FEE,
            toEntityId: centerId,
            centerId,
            lessonId: sessionId,
            status: "completed",
            notes: `Platform fee returned (center side) — refund: ${reason}`,
          },
        ],
      });

      // Claw the net back out of the wallets it was credited to.
      if (teacherNet !== 0) {
        await tx.teacherProfile.updateMany({
          where: { userId: teacherId },
          data: { walletBalance: { decrement: teacherNet } },
        });
      }
      if (centerNet !== 0) {
        await tx.center.update({
          where: { id: centerId },
          data: { walletBalance: { decrement: centerNet } },
        });
      }

      return { studentId, centerId, teacherId, refunded: perSessionPrice, teacherNet, centerNet };
    },
    { actorId: user.id },
  );

  // Notify the student (+ linked parents) after the tx closes.
  const links = await platformDb((tx) =>
    tx.parentStudentLink.findMany({
      where: { studentId, status: "approved" },
      select: { parentId: true },
    }),
  );
  const recipients = [studentId, ...links.map((l) => l.parentId)];
  await notify({
    recipients,
    type: "payment_refunded",
    title: "Refund issued",
    body: `A refund of ${(outcome.refunded / 100).toFixed(2)} EGP has been issued for a lesson.`,
    data: { sessionId, amount: outcome.refunded, reason },
  });

  return outcome;
}
