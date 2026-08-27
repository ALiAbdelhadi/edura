import { send } from "@repo/notifications";
import { platformDb } from "../../db/scope";
import { appBaseUrl } from "../../http/app-url";

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
    if (payment.amount <= 0) return { sent: false, reason: "not_a_payment" };
    if (payment.status !== "paid") return { sent: false, reason: "not_paid" };

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
    console.error(
      `[receipt-email] ${receiptNumber}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { sent: false, reason: "error" };
  }
}

export function receiptNumberFrom(data: Record<string, unknown> | undefined): string | null {
  const value = data?.receiptNumber;
  return typeof value === "string" && value.length > 0 ? value : null;
}
