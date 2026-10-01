import { Prisma } from "@repo/database";
import { platformDb, type TenantTx } from "../../db/scope";
import { NotFoundError, BusinessRuleError } from "../../errors/classes";
import { notifyAfterCommit } from "../../services/notifications/notify";
import { nextTxnRefs } from "../../services/finance/ref-numbers";
import { resolveCommission } from "../../services/finance/commission";
import { computeNoRoomLessonSplit } from "../../services/finance/fees";
import { creditMove } from "../../services/finance/center-credit";
import { resolveTeacherAgreement } from "../../services/finance/agreements";
import { computeAgreementSplit } from "../../services/finance/fees";
import {
  resolveRefundTarget,
  creditRefundTarget,
} from "../../services/wallet/refund-target";
import type { SessionUser } from "../../auth/types";

const ALREADY_REFUNDED = "This lesson charge has already been refunded";

// The wallet is decremented conditionally, exactly as settlePayout does, so the
// shortfall surfaces as a 422 the accountant can act on rather than as the DB
// CHECK's unmapped SQLSTATE 23514 → 500. Money outcome is unchanged: the refund
// is refused, not partially applied.
const CLAWBACK_SHORT = (side: "teacher" | "center") =>
  `The ${side} wallet no longer holds this lesson's share — it was already paid out. ` +
  "Recover the amount from the next payout, then refund.";

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
          throw new BusinessRuleError("Teacher-direct sessions have no lesson charge to refund");
        }
        const centerId = course.centerId;
        const teacherId = course.teacherId;

        const perSessionPrice = payment.amount;
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
          centerShare = computeNoRoomLessonSplit(
            perSessionPrice,
            affiliation?.centerShare ?? 0,
            await resolveCommission(tx, { teacherId, centerId }),
          ).centerShare;
        }

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

        if (course.pricingMethod == null && course.splitPlatformBp == null) {
          const agreement = await resolveTeacherAgreement(tx, {
            centerId,
            teacherId,
            onDate: session.date,
          });
          if (agreement) {
            centerShare = computeAgreementSplit(perSessionPrice, agreement, {
              platformTeacherFee: teacherFee,
              platformCenterFee: centerFee,
            }).centerShare;
          }
        }

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
          const clawed = await tx.teacherProfile.updateMany({
            where: { userId: teacherId, walletBalance: { gte: teacherNet } },
            data: { walletBalance: { decrement: teacherNet } },
          });
          if (clawed.count === 0) throw new BusinessRuleError(CLAWBACK_SHORT("teacher"));
        }
        if (payment.funding === "center_held") {
          if (centerNet !== 0) {
            await creditMove(tx, {
              centerId,
              type: "refund_reversal",
              delta: -centerNet,
              sessionId,
              relatedTxnId: payment.id,
              recordedBy: user.id,
              reason: `Refund of a center-collected lesson charge: ${reason}`,
            });
          }
        } else if (centerNet !== 0) {
          const clawed = await tx.center.updateMany({
            where: { id: centerId, walletBalance: { gte: centerNet } },
            data: { walletBalance: { decrement: centerNet } },
          });
          if (clawed.count === 0) throw new BusinessRuleError(CLAWBACK_SHORT("center"));
        }

        // Money returns to whoever parted with it: the parent's wallet when a
        // parent funded this lesson, the student's otherwise. The ledger rows
        // above are untouched by this -- they still record student -> centre.
        const refundTarget = await resolveRefundTarget(tx, {
          studentId,
          session: { id: session.id, courseId: session.courseId, date: session.date },
        });
        const { balanceAfter: walletBalanceAfter } = await creditRefundTarget(
          tx,
          refundTarget,
          perSessionPrice,
          {
            type: "refund",
            refNumber: refundRef,
            reason: `Refund to wallet: ${reason}`,
            recordedBy: user.id,
          },
        );

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "refund.issued",
            targetType: "transaction",
            targetId: payment.id,
            centerId,
            afterState: {
              sessionId,
              studentId,
              refunded: perSessionPrice,
              teacherNet,
              centerNet,
              teacherFee,
              centerFee,
              reason,
              refundRef,
              creditedTo: refundTarget.kind,
              creditedUserId: refundTarget.userId,
            } as never,
          },
        });

        return {
          studentId,
          centerId,
          teacherId,
          refunded: perSessionPrice,
          teacherNet,
          centerNet,
          walletBalanceAfter,
          creditedTo: refundTarget.kind,
          creditedUserId: refundTarget.userId,
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
  await notifyAfterCommit({
    recipients,
    type: "payment_refunded",
    title: "Refund issued",
    body: `A refund of ${(outcome.refunded / 100).toFixed(2)} EGP has been issued for a lesson.`,
    data: { sessionId, amount: outcome.refunded, reason },
  });

  return outcome;
}
