import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { getPayment } from "./payments";

export type ReceiptDocument = {
  receiptNumber: string;
  amount: number;
  currency: string;
  isRefund: boolean;
  paymentMethod: string | null;
  note: string | null;
  paidAt: Date;
  student: { id: string | null; name: string; code: string | null };
  payer: { id: string; name: string } | null;
  issuer: { kind: "center" | "teacher" | "platform"; id: string | null; name: string };
  course: { id: string; title: string } | null;
  recordedBy: { id: string; name: string } | null;
};

export async function buildReceiptDocument(
  paymentId: string,
  user: SessionUser,
): Promise<ReceiptDocument> {
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
