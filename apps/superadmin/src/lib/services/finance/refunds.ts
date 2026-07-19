import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";
import { nextTxnRefs } from "@/lib/services/finance/ref-numbers";
import { PLATFORM_TEACHER_FEE, PLATFORM_CENTER_FEE } from "@/lib/services/finance/fees";
import type { SessionUser } from "@/lib/auth/session";

export async function refundLessonForStudent(
  sessionId: string,
  studentId: string,
  reason: string,
  user: SessionUser,
) {
  if (!reason?.trim()) throw new BusinessRuleError("A refund reason is required");

  const outcome = await platformDb(
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
      if (already) throw new BusinessRuleError("This lesson charge has already been refunded");

      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError("Session not found");
      const course = await tx.course.findUnique({
        where: { id: session.courseId },
        select: { centerId: true, teacherId: true },
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
      const affiliation = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId, teacherId, status: "active" },
        select: { centerShare: true },
      });
      const centerShare = affiliation?.centerShare ?? 0;
      const teacherNet = perSessionPrice - PLATFORM_TEACHER_FEE - centerShare;
      const centerNet = centerShare - PLATFORM_CENTER_FEE;

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
