import { scopedDb } from "../../db/scope";
import { notify } from "../../services/notifications/notify";
import { studentAndParents } from "../../services/notifications/fanout";
import { awardPoints } from "../../services/points/points";
import { nextTxnRef } from "../../services/finance/ref-numbers";
import { openShiftIdFor } from "../center/shifts";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { dayRange } from "../../lib/day-range";

function formatReceiptNumber(shortId: string, seq: number): string {
  const year = new Date().getFullYear();
  return `RCP-${shortId}-${year}-${String(seq).padStart(5, "0")}`;
}

// Phase 1 (revenue-operations spec §2.2): the manual desk takes the same four
// channels the counter takes. Absent = cash — this writer IS the cash desk,
// and refunds default to cash too because a counter refund is handed back out
// of the drawer whatever channel the money arrived by.
export type CounterMethod = "cash" | "instapay" | "pos_card" | "mobile_wallet";

export async function recordPayment(
  data: {
    studentId: string;
    courseId?: string;
    amount: number;
    note?: string;
    paymentMethod?: CounterMethod;
  },
  user: SessionUser,
) {
  if (data.amount === 0) throw new BusinessRuleError("Amount must not be zero");
  const method: CounterMethod = data.paymentMethod ?? "cash";

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
        // MC-3: the channel the operator recorded (default cash) — the ledger
        // mirror below records the same value.
        paymentMethod: method,
        note: data.note ?? "",
        receiptNumber,
        recordedBy: user.id,
        // Phase 2: stamp the recorder's open drawer session (NULL when none).
        shiftId: await openShiftIdFor(tx, user.id),
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
        paymentMethod: method,
        notes:
          method === "cash"
            ? `Cash payment at center (receipt ${receiptNumber})` // byte-identical to before Phase 1
            : `Counter payment (${method}) at center (receipt ${receiptNumber})`,
      },
    });

    if (data.amount > 0) {
      // This writer is the CASH desk (paymentMethod: "cash" above), so the
      // ledger says cash — it used to say `online_payment`.
      await awardPoints(tx, data.studentId, "cash_payment", {
        reason: "Cash payment recorded",
      });
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
      if (filters.studentId) {
        const link = await tx.parentStudentLink.findFirst({
          where: { parentId: user.id, studentId: filters.studentId, status: "approved" },
        });
        if (!link) throw new ForbiddenError("Not linked to this student");
        where.studentId = filters.studentId;
      } else {
        // NO `studentId` NOW MEANS "MY OWN RECEIPTS", where it used to be an
        // error. A parent wallet top-up names no student — that is the whole
        // point of it — so there is no child id that could ever reach it, and
        // requiring one made the parent's own money unreadable to them.
        //
        // This grants NOTHING new about a child: `payer_user_id` is the parent's
        // own id, and a child's own payments carry a NULL payer (or another
        // payer's id) and are not selected here. Reading a child still goes
        // through the link check above, unchanged.
        where.payerUserId = user.id;
      }
    } else {
      throw new ForbiddenError();
    }

    // THE WHOLE `to` DAY IS INCLUDED. This used to be
    // `lte = new Date(filters.to)` — midnight, i.e. the instant the day STARTS
    // — so a `to` of today excluded every payment taken today. The Fees screen
    // drives this log and the P&L above it from ONE date field, and they
    // disagreed by a day because they bounded the range in two places. They now
    // share `dayRange`.
    const paidAt = dayRange(filters.from, filters.to);
    if (paidAt) where.paidAt = paidAt;

    const payments = await tx.payment.findMany({ where, orderBy: { paidAt: "desc" } });

    // `.filter(Boolean)` is load-bearing now, not defensive: a parent wallet
    // top-up carries no student, and passing a NULL into an `in` list is a
    // Prisma type error rather than a no-op.
    const studentIds = [
      ...new Set(payments.map((p) => p.studentId).filter(Boolean) as string[]),
    ];
    const courseIds = [...new Set(payments.map((p) => p.courseId).filter(Boolean) as string[])];
    const [students, courses, profiles] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, email: true },
      }),
      tx.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      }),
      // The printable code — what the fees log shows instead of a raw UUID.
      tx.studentProfile.findMany({
        where: { userId: { in: studentIds } },
        select: { userId: true, studentCode: true },
      }),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const codeMap = new Map(profiles.map((p) => [p.userId, p.studentCode]));

    return payments.map((p) => {
      const s = p.studentId ? studentMap.get(p.studentId) : null;
      const c = p.courseId ? courseMap.get(p.courseId) : null;
      return {
        ...p,
        // "" rather than a fabricated name. A studentless row is a parent's own
        // wallet top-up, and inventing a student for it in the log is exactly
        // the kind of fiction this pass has been removing elsewhere.
        studentName: s?.name ?? "",
        studentEmail: s?.email ?? "",
        studentCode: (p.studentId ? codeMap.get(p.studentId) : null) ?? null,
        courseName: c?.title ?? "",
      };
    });
  });
}

export async function getPayment(paymentId: string, user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundError("Payment not found");

    // WHOEVER PAID OWNS THE RECEIPT. The same rule `getIntentForStudent` already
    // applies to intents ("ownership = who is PAYING it"), extended to the row
    // the settlement writes — otherwise a parent could fund a top-up and be
    // refused the receipt for their own money.
    if (payment.payerUserId && payment.payerUserId === user.id) {
      return payment;
    }

    if (user.role === "center_admin") {
      if (payment.centerId !== user.centerId) throw new ForbiddenError();
    } else if (user.role === "student") {
      if (payment.studentId !== user.id) throw new ForbiddenError();
    } else if (user.role === "parent") {
      // A studentless receipt belongs to its payer and nobody else; it was
      // handled above. Falling through here with a NULL student would query
      // `studentId: null`, match no link, and refuse — correct, but by accident.
      // Refusing on purpose is the difference between a rule and a coincidence.
      if (!payment.studentId) throw new ForbiddenError();
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
