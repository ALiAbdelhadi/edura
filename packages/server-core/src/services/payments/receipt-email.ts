import { send } from "@repo/notifications";
import { platformDb } from "../../db/scope";
import { appBaseUrl } from "../../http/app-url";

// =============================================================================
// Payment receipt email.
//
// POST-COMMIT AND READ-ONLY, by construction:
//   * it takes a `receiptNumber` (unique on payments) rather than a transaction
//     handle, so it CANNOT be called from inside a settlement — there is no
//     `tx` parameter to pass it;
//   * it opens its own read to build the receipt and writes nothing.
// A receipt is a record of money that already moved. Nothing it does may be
// able to un-move it.
//
// NEVER THROWS. Callers are notification sites that run after the money is
// already committed.
//
// A WALLET TOP-UP DOES GET A RECEIPT — both kinds. The student path has written
// a Payment row since it was built; the parent path joined it on 2026-08-20
// (migration 20260820200000_parent_topup_receipt), which is what this comment
// used to deny. The row carries a NULL center_id and a NULL course_id, so
// `payeeName` falls through to "Edura"/"إدورا" and `description` to the note —
// both already handled below, because a float deposit has no center or course
// to name.
//
// The lookup still no-ops for anything with no Payment row at all, and returns
// `no_payment_row` rather than throwing. That path is now the exception, not
// the top-up case.
// =============================================================================

export type ReceiptMethod = "card" | "wallet" | "cash";

export async function sendPaymentReceiptEmail(
  receiptNumber: string,
  method: ReceiptMethod,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const payment = await platformDb((tx) =>
      tx.payment.findUnique({
        where: { receiptNumber },
        select: {
          amount: true,
          paidAt: true,
          note: true,
          centerId: true,
          courseId: true,
          studentId: true,
          payerUserId: true,
          status: true,
        },
      }),
    );
    if (!payment) return { sent: false, reason: "no_payment_row" };
    // Negative amounts are refunds; they have their own notification and are
    // not "here is what you paid".
    if (payment.amount <= 0) return { sent: false, reason: "not_a_payment" };
    if (payment.status !== "paid") return { sent: false, reason: "not_paid" };

    // The receipt goes to WHOEVER PAID. When a parent funded their child's
    // lesson the parent is the one who needs the record; the child already gets
    // the in-app "subscription active" notification through the normal fan-out.
    //
    // BOTH CAN NEVER BE NULL. The `payments_student_required` CHECK guarantees
    // that a studentless row names its payer. Asserted rather than `!`-silenced,
    // because a future row shape that breaks it should fail HERE, visibly, and
    // not send somebody else's receipt to the wrong inbox.
    const recipientId = payment.payerUserId ?? payment.studentId;
    if (!recipientId) return { sent: false, reason: "no_recipient" };

    const [recipient, center, course] = await Promise.all([
      platformDb((tx) =>
        tx.user.findUnique({
          where: { id: recipientId },
          select: { email: true, locale: true },
        }),
      ),
      payment.centerId
        ? platformDb((tx) =>
            tx.center.findUnique({ where: { id: payment.centerId! }, select: { name: true } }),
          )
        : Promise.resolve(null),
      payment.courseId
        ? platformDb((tx) =>
            tx.course.findUnique({
              where: { id: payment.courseId! },
              select: { title: true, teacherId: true },
            }),
          )
        : Promise.resolve(null),
    ]);

    if (!recipient?.email) return { sent: false, reason: "no_email" };

    // Center-run course -> the center is the payee. Teacher-direct (nullable
    // centerId, see roadmap decision #2) -> the teacher is. `Course.teacherId`
    // is a USER id, not a TeacherProfile id (see finance/distribution.ts).
    const teacher =
      !payment.centerId && course?.teacherId
        ? await platformDb((tx) =>
            tx.user.findUnique({ where: { id: course.teacherId }, select: { name: true } }),
          )
        : null;

    const payeeName =
      center?.name ?? teacher?.name ?? (recipient.locale === "en" ? "Edura" : "إدورا");

    const description =
      course?.title ?? payment.note ?? (recipient.locale === "en" ? "Payment" : "دفعة");

    const result = await send(
      "payment_receipt",
      { email: recipient.email, locale: recipient.locale, userId: recipientId },
      {
        receiptNumber,
        amountPiasters: payment.amount,
        description,
        payeeName,
        method,
        paidAt: payment.paidAt,
        link: `${appBaseUrl().replace(/\/+$/, "")}/${recipient.locale === "en" ? "en" : "ar"}/dashboard`,
      },
    );

    return result.delivered ? { sent: true } : { sent: false, reason: "not_delivered" };
  } catch (err) {
    // The receipt is a courtesy on top of a committed payment. It may not be
    // able to fail anything.
    console.error(
      `[receipt-email] ${receiptNumber}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { sent: false, reason: "error" };
  }
}

/**
 * Pull the receipt number out of a settlement notification's `data` bag. Every
 * settler already puts it there for the in-app notification, which is why the
 * receipt email needs no change to any money path to exist.
 */
export function receiptNumberFrom(data: Record<string, unknown> | undefined): string | null {
  const value = data?.receiptNumber;
  return typeof value === "string" && value.length > 0 ? value : null;
}
