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
// THE METHOD IS NOW A FIRST-CLASS FACT (Phase 1, revenue-operations spec).
// This header used to explain why the receipt stated no payment method: the
// method lived only on the ledger row, recoverable from a receipt's Payment
// only by matching amount and timestamp — a heuristic, and a guessed fact on
// a receipt is worse than an absent one. MC-3 ended that: `payments.
// payment_method` is written by every money path in the same transaction as
// the row itself, so the receipt now reads it directly. `unknown` (a row
// predating MC-3, or a writer that forgot) is surfaced as NULL here and the
// renderer omits the line — an admitted gap, never a guess (the MC-3 rule).
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
  /** The funding channel from `payments.payment_method`; NULL when the row
   *  honestly does not know (`unknown`). */
  paymentMethod: string | null;
  note: string | null;
  paidAt: Date;
  /**
   * Who the receipt is FOR.
   *
   * `id` is NULL and `name` is "" on a parent wallet top-up, which has no
   * beneficiary student until the money is spent — the
   * `issuer.kind === "platform"` case this file already anticipated. The
   * document then names only its PAYER, which is exactly what a float-deposit
   * receipt should say.
   *
   * THE OBJECT ITSELF STAYS PRESENT rather than becoming nullable. The receipt
   * sheet reads `student.name || "—"` and `student.code`, both of which already
   * do the right thing with an empty name, so a studentless receipt prints
   * "—" against the student label and the parent's name against the payer one —
   * with no change to the renderer. Making the object nullable would have
   * bought a more precise type and forced a presentation change to express the
   * same two rows.
   */
  student: { id: string | null; name: string; code: string | null };
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
    const studentId = payment.studentId;
    const [student, studentProfile, payer, recorder, center, course] = await Promise.all([
      studentId
        ? tx.user.findUnique({ where: { id: studentId }, select: { id: true, name: true } })
        : Promise.resolve(null),
      studentId
        ? tx.studentProfile.findUnique({
            where: { userId: studentId },
            select: { studentCode: true },
          })
        : Promise.resolve(null),
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
      paymentMethod: payment.paymentMethod === "unknown" ? null : payment.paymentMethod,
      note: payment.note,
      paidAt: payment.paidAt,
      student: {
        id: studentId,
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
