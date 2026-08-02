import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { getPayment } from "./payments";

// ===========================================================================
// RECEIPT DOCUMENT — everything a printable receipt needs, resolved once.
//
// AUTHORIZATION IS NOT REIMPLEMENTED HERE. `getPayment` already decides who
// may see a payment (the student themselves, an approved parent, the owning
// center). This module calls it FIRST and builds nothing until it returns, so
// there is exactly one answer to "may I see this receipt?" and it is the same
// one the JSON endpoint gives.
//
// WHAT THE RECEIPT DOES NOT CLAIM. It does not state a payment method. The
// `payments` row carries no foreign key to its `transactions` row — the two
// are written in the same transaction but linked only by convention — so the
// method could be recovered from the ledger only by matching on amount and
// timestamp. A receipt is a document someone may hand to an accountant or a
// parent; putting a heuristically-guessed fact on it is worse than leaving it
// off. Adding `payments.transaction_id` (additive, forward-only) is the
// follow-on that would let the method appear honestly.
//
// A REFUND IS A RECEIPT TOO. `amount` is SIGNED in this schema — negative
// means a refund — so the document carries `isRefund` and the renderer titles
// the page accordingly rather than printing a receipt for "−450.00 EGP" as if
// it were a payment.
// ===========================================================================

export type ReceiptDocument = {
  receiptNumber: string;
  /** Signed piasters, exactly as stored. Negative = refund. */
  amount: number;
  currency: string;
  isRefund: boolean;
  note: string | null;
  paidAt: Date;
  /** Who the receipt is FOR. */
  student: { id: string; name: string; code: string | null };
  /** Who actually handed over the money, when that is not the student. */
  payer: { id: string; name: string } | null;
  /** Who ISSUED it — a center, or a teacher for a teacher-direct course. */
  issuer: { kind: "center" | "teacher" | "platform"; id: string | null; name: string };
  course: { id: string; title: string } | null;
  /** The staff member who recorded it, named on the document (attribution). */
  recordedBy: { id: string; name: string } | null;
};

export async function buildReceiptDocument(
  paymentId: string,
  user: SessionUser,
): Promise<ReceiptDocument> {
  // Gate first. Everything below runs only for a caller already allowed to
  // read this payment.
  const payment = await getPayment(paymentId, user);

  return scopedDb(user, async (tx) => {
    const [student, studentProfile, payer, recorder, center, course] = await Promise.all([
      tx.user.findUnique({ where: { id: payment.studentId }, select: { id: true, name: true } }),
      tx.studentProfile.findUnique({
        where: { userId: payment.studentId },
        select: { studentCode: true },
      }),
      payment.payerUserId
        ? tx.user.findUnique({ where: { id: payment.payerUserId }, select: { id: true, name: true } })
        : Promise.resolve(null),
      tx.user.findUnique({ where: { id: payment.recordedBy }, select: { id: true, name: true } }),
      payment.centerId
        ? tx.center.findUnique({ where: { id: payment.centerId }, select: { id: true, name: true } })
        : Promise.resolve(null),
      payment.courseId
        ? tx.course.findUnique({
            where: { id: payment.courseId },
            select: { id: true, title: true, teacherId: true },
          })
        : Promise.resolve(null),
    ]);

    // Teacher-direct: centerId is NULL by design (no shadow centers), so the
    // issuer is the course's teacher. With neither, the platform issued it —
    // which is what a wallet top-up receipt is.
    let issuer: ReceiptDocument["issuer"];
    if (center) {
      issuer = { kind: "center", id: center.id, name: center.name };
    } else if (course?.teacherId) {
      const teacher = await tx.user.findUnique({
        where: { id: course.teacherId },
        select: { id: true, name: true },
      });
      issuer = { kind: "teacher", id: teacher?.id ?? null, name: teacher?.name ?? "" };
    } else {
      issuer = { kind: "platform", id: null, name: "Edura" };
    }

    return {
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      currency: payment.currency,
      isRefund: payment.amount < 0,
      note: payment.note,
      paidAt: payment.paidAt,
      student: {
        id: payment.studentId,
        name: student?.name ?? "",
        code: studentProfile?.studentCode ?? null,
      },
      payer: payer ? { id: payer.id, name: payer.name } : null,
      issuer,
      course: course ? { id: course.id, title: course.title } : null,
      recordedBy: recorder ? { id: recorder.id, name: recorder.name } : null,
    };
  });
}
