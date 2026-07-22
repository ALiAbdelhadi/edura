import { Prisma } from "@repo/database";
import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";
import { nextTxnRefs } from "@/lib/services/finance/ref-numbers";
import { resolveCommission } from "@/lib/services/finance/commission";
import { walletCredit } from "@repo/server-core/services/wallet/wallet";
import type { SessionUser } from "@/lib/auth/session";

const ALREADY_REFUNDED = "This lesson charge has already been refunded";

// H3: the concurrent racer that slips past the findFirst pre-check hits the
// partial unique (transactions_one_refund_per_payment). Within the refund
// transaction the ONLY data-dependent unique is that index — the ref numbers
// are sequential and never collide — so a P2002 here always means a concurrent
// refund already landed. (Prisma reports a partial index's meta.target as
// "(not available)", so we can't match on the constraint name.)
function isDuplicateRefund(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function refundLessonForStudent(
  sessionId: string,
  studentId: string,
  reason: string,
  user: SessionUser,
) {
  if (!reason?.trim()) throw new BusinessRuleError("A refund reason is required");

  let outcome;
  try {
    outcome = await platformDb(
      async (tx: TenantTx) => {
        const payment = await tx.transaction.findFirst({
          where: { lessonId: sessionId, fromEntityId: studentId, type: "payment", status: "completed" },
          orderBy: { createdAt: "asc" },
        });
        if (!payment) throw new NotFoundError("No completed charge found for this student and lesson");

        // Fast path (clean message for a sequential re-refund). The partial
        // unique is the concurrency backstop for two requests that both pass
        // this check.
        const already = await tx.transaction.findFirst({
          where: { reversalOfId: payment.id, type: "refund" },
          select: { id: true },
        });
        if (already) throw new BusinessRuleError(ALREADY_REFUNDED);

        const session = await tx.session.findUnique({ where: { id: sessionId } });
        if (!session) throw new NotFoundError("Session not found");
        const course = await tx.course.findUnique({
          where: { id: session.courseId },
          select: {
            centerId: true,
            teacherId: true,
            splitPlatformBp: true,
            splitCenterBp: true,
            pricingMethod: true,
            m2CenterFee: true,
            m2CenterBp: true,
          },
        });
        if (!course) throw new NotFoundError("Course not found");
        if (!course.centerId) {
          // Lesson-revenue refunds reverse distributeSessionRevenue, which never
          // runs for teacher-direct courses (revenue settles at subscription
          // payment). Refunding teacher-direct subscriptions is a Step 4.5+
          // flow of its own.
          throw new BusinessRuleError("Teacher-direct sessions have no lesson charge to refund");
        }
        const centerId = course.centerId;
        const teacherId = course.teacherId;

        const perSessionPrice = payment.amount;
        // Mirror distribution's per-course rule so the reversal is exact:
        //  • Method 2 (per_attending_student) → the center's share is the rate
        //    frozen on the course (flat piasters, or bp of the charged price),
        //    same formula the settlement used.
        //  • Method 1 / ROOM-BASED → derived from the course's frozen split
        //    snapshot (immutable → never drifts).
        //  • NO-ROOM course → the flat affiliation.centerShare (legacy).
        // The platform fees are reversed from the ACTUAL charged commission rows
        // below (already the case), so all pricing models reverse correctly.
        let centerShare: number;
        if (course.pricingMethod === "per_attending_student") {
          centerShare =
            course.m2CenterFee ??
            Math.round((perSessionPrice * (course.m2CenterBp ?? 0)) / 10_000);
        } else if (course.splitPlatformBp != null && course.splitCenterBp != null) {
          centerShare = Math.round((perSessionPrice * course.splitCenterBp) / 10_000);
        } else {
          const affiliation = await tx.centerTeacherAffiliation.findFirst({
            where: { centerId, teacherId, status: "active" },
            select: { centerShare: true },
          });
          centerShare = affiliation?.centerShare ?? 0;
        }

        // Step 4.5 correctness: reverse the fees that were ACTUALLY CHARGED for
        // this lesson (the commission Transactions written at distribution
        // time), not whatever the setting says today — commission is mutable
        // now. The resolved setting is only a fallback for ledger rows that
        // somehow predate the fee transactions.
        const chargedFees = await tx.transaction.findMany({
          where: { type: "commission", lessonId: sessionId, fromEntityId: { in: [teacherId, centerId] } },
          select: { fromEntityId: true, amount: true },
        });
        const chargedTeacherFee = chargedFees.find((f) => f.fromEntityId === teacherId)?.amount;
        const chargedCenterFee = chargedFees.find((f) => f.fromEntityId === centerId)?.amount;
        const fallback =
          chargedTeacherFee === undefined || chargedCenterFee === undefined
            ? await resolveCommission(tx, { teacherId, centerId })
            : null;
        const teacherFee = chargedTeacherFee ?? fallback!.platformTeacherFee;
        const centerFee = chargedCenterFee ?? fallback!.platformCenterFee;

        const teacherNet = perSessionPrice - teacherFee - centerShare;
        const centerNet = centerShare - centerFee;

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
            {
              refNumber: teacherAdjRef,
              type: "adjustment",
              amount: teacherFee,
              toEntityId: teacherId,
              centerId,
              lessonId: sessionId,
              status: "completed",
              notes: `Platform fee returned (teacher side) — refund: ${reason}`,
            },
            {
              refNumber: centerAdjRef,
              type: "adjustment",
              amount: centerFee,
              toEntityId: centerId,
              centerId,
              lessonId: sessionId,
              status: "completed",
              notes: `Platform fee returned (center side) — refund: ${reason}`,
            },
          ],
        });

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

        // Return the originally-charged amount to the STUDENT'S WALLET. This
        // credit rides the SAME tx as the refund insert above, which bears
        // reversalOfId = payment.id under the transactions_one_refund_per_payment
        // partial unique — so a concurrent/second refund's insert fails (P2002)
        // and the whole tx (including this credit) rolls back. The wallet is
        // therefore credited EXACTLY ONCE, at the originally-charged amount, with
        // no extra guard.
        const { balanceAfter: walletBalanceAfter } = await walletCredit(
          tx,
          studentId,
          perSessionPrice,
          {
            type: "refund",
            refNumber: refundRef,
            reason: `Refund to wallet: ${reason}`,
            recordedBy: user.id,
          },
        );

        return {
          studentId,
          centerId,
          teacherId,
          refunded: perSessionPrice,
          teacherNet,
          centerNet,
          walletBalanceAfter,
        };
      },
      { actorId: user.id },
    );
  } catch (err) {
    if (isDuplicateRefund(err)) throw new BusinessRuleError(ALREADY_REFUNDED);
    throw err;
  }

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
