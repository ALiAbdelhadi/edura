import { scopedDb } from "../../db/scope";
import { notify } from "../../services/notifications/notify";
import { studentAndParents } from "../../services/notifications/fanout";
import { awardPoints } from "../../services/points/points";
import { nextTxnRef } from "../../services/finance/ref-numbers";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

function formatReceiptNumber(shortId: string, seq: number): string {
  const year = new Date().getFullYear();
  return `RCP-${shortId}-${year}-${String(seq).padStart(5, "0")}`;
}

export async function recordPayment(
  data: { studentId: string; courseId?: string; amount: number; note?: string },
  user: SessionUser,
) {
  if (data.amount === 0) throw new BusinessRuleError("Amount must not be zero");

  const { payment, receiptNumber } = await scopedDb(user, async (tx) => {
    const rosterEntry = await tx.centerStudentRoster.findFirst({
      where: { centerId: user.centerId, studentId: data.studentId, leftAt: null },
    });
    if (!rosterEntry) throw new BusinessRuleError("Student is not in this center roster");

    if (data.courseId) {
      const course = await tx.course.findFirst({
        where: { id: data.courseId, centerId: user.centerId, status: "active" },
      });
      if (!course) throw new NotFoundError("Class not found");

      const enrollment = await tx.enrollment.findFirst({
        where: {
          centerId: user.centerId,
          studentId: data.studentId,
          courseId: data.courseId,
          status: "active",
        },
      });
      if (!enrollment) throw new BusinessRuleError("Student is not enrolled in this class");
    }

    let center;
    try {
      center = await tx.center.update({
        where: { id: user.centerId as string },
        data: { receiptSeq: { increment: 1 } },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") {
        throw new NotFoundError("Center not found");
      }
      throw err;
    }

    const receiptNumber = formatReceiptNumber(center.shortId, center.receiptSeq);

    const payment = await tx.payment.create({
      data: {
        centerId: user.centerId as string,
        studentId: data.studentId,
        courseId: data.courseId ?? null,
        amount: data.amount,
        note: data.note ?? "",
        receiptNumber,
        recordedBy: user.id,
        paidAt: new Date(),
      },
    });

    // Step 4 ledger reconciliation: cash payments mirror to the Transaction
    // ledger exactly like online ones, so the accountant ledger is complete.
    // Refunds (negative amounts) mirror as type=refund with reversed parties.
    const refNumber = await nextTxnRef(tx);
    await tx.transaction.create({
      data: {
        refNumber,
        type: data.amount >= 0 ? "payment" : "refund",
        amount: Math.abs(data.amount),
        fromEntityId: data.amount >= 0 ? data.studentId : (user.centerId as string),
        toEntityId: data.amount >= 0 ? (user.centerId as string) : data.studentId,
        centerId: user.centerId as string,
        status: "completed",
        paymentMethod: "cash",
        notes: `Cash payment at center (receipt ${receiptNumber})`,
      },
    });

    if (data.amount > 0) {
      await awardPoints(tx, data.studentId, "online_payment", { reason: "Payment recorded" });
    }

    return { payment, receiptNumber };
  });

  await notify({
    recipients: await studentAndParents(data.studentId),
    type: "payment_recorded",
    title: data.amount > 0 ? "Payment recorded" : "Refund recorded",
    body: `Receipt ${receiptNumber} has been issued.`,
    data: { paymentId: payment.id, receiptNumber, amount: data.amount, studentId: data.studentId },
  });

  return payment;
}

export async function listPayments(
  filters: { studentId?: string; courseId?: string; from?: string; to?: string },
  user: SessionUser,
) {
  return scopedDb(user, async (tx) => {
    const where: Record<string, unknown> = {};

    if (user.role === "center_admin") {
      where.centerId = user.centerId;
      if (filters.studentId) where.studentId = filters.studentId;
      if (filters.courseId) where.courseId = filters.courseId;
    } else if (user.role === "student") {
      where.studentId = user.id;
      if (filters.courseId) where.courseId = filters.courseId;
    } else if (user.role === "parent") {
      if (!filters.studentId) throw new BusinessRuleError("studentId is required for parents");
      const link = await tx.parentStudentLink.findFirst({
        where: { parentId: user.id, studentId: filters.studentId, status: "approved" },
      });
      if (!link) throw new ForbiddenError("Not linked to this student");
      where.studentId = filters.studentId;
    } else {
      throw new ForbiddenError();
    }

    if (filters.from || filters.to) {
      const dateFilter: Record<string, Date> = {};
      if (filters.from) dateFilter.gte = new Date(filters.from);
      if (filters.to) dateFilter.lte = new Date(filters.to);
      where.paidAt = dateFilter;
    }

    const payments = await tx.payment.findMany({ where, orderBy: { paidAt: "desc" } });

    const studentIds = [...new Set(payments.map((p) => p.studentId))];
    const courseIds = [...new Set(payments.map((p) => p.courseId).filter(Boolean) as string[])];
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

    return payments.map((p) => {
      const s = studentMap.get(p.studentId);
      const c = p.courseId ? courseMap.get(p.courseId) : null;
      return {
        ...p,
        studentName: s?.name ?? "",
        studentEmail: s?.email ?? "",
        courseName: c?.title ?? "",
      };
    });
  });
}

export async function getPayment(paymentId: string, user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundError("Payment not found");

    if (user.role === "center_admin") {
      if (payment.centerId !== user.centerId) throw new ForbiddenError();
    } else if (user.role === "student") {
      if (payment.studentId !== user.id) throw new ForbiddenError();
    } else if (user.role === "parent") {
      const link = await tx.parentStudentLink.findFirst({
        where: { parentId: user.id, studentId: payment.studentId, status: "approved" },
      });
      if (!link) throw new ForbiddenError("Not linked to this student");
    } else {
      throw new ForbiddenError();
    }

    return payment;
  });
}

export async function getReceipt(paymentId: string, user: SessionUser) {
  const payment = await getPayment(paymentId, user);

  return {
    receiptNumber: payment.receiptNumber,
    amount: payment.amount,
    currency: payment.currency,
    note: payment.note,
    paidAt: payment.paidAt,
    studentId: payment.studentId,
    courseId: payment.courseId,
    centerId: payment.centerId,
    recordedBy: payment.recordedBy,
    isRefund: payment.amount < 0,
  };
}
