import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import type { Prisma } from "@repo/database";

export type IntentListFilters = {
  q?: string; // student name/email or gateway order id / ref
  status?: string;
  gateway?: string;
  method?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

const STATUSES = new Set(["pending", "paid", "failed", "expired"]);
const GATEWAYS = new Set(["mock", "paymob"]);
const METHODS = new Set(["card", "wallet"]);

export async function listPaymentIntents(filters: IntentListFilters) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? "20", 10) || 20));

  return platformDb(async (tx) => {
    const where: Prisma.PaymentIntentWhereInput = {};

    if (filters.status && STATUSES.has(filters.status)) {
      where.status = filters.status as never;
    }
    if (filters.gateway && GATEWAYS.has(filters.gateway)) {
      where.gateway = filters.gateway as never;
    }
    if (filters.method && METHODS.has(filters.method)) {
      where.method = filters.method as never;
    }
    if (filters.from || filters.to) {
      const range: Prisma.DateTimeFilter = {};
      if (filters.from) range.gte = new Date(filters.from);
      if (filters.to) range.lte = new Date(filters.to);
      where.createdAt = range;
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      const students = await tx.user.findMany({
        where: {
          role: "student",
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 500,
      });
      where.OR = [
        { studentId: { in: students.map((s) => s.id) } },
        { gatewayOrderId: { contains: q, mode: "insensitive" } },
        { gatewayRef: { contains: q, mode: "insensitive" } },
        { idempotencyKey: { contains: q, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      tx.paymentIntent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.paymentIntent.count({ where }),
    ]);

    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const courseIds = [...new Set(rows.map((r) => r.courseId).filter(Boolean) as string[])];
    const centerIds = [...new Set(rows.map((r) => r.centerId).filter(Boolean) as string[])];
    const [students, courses, centers] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, email: true },
      }),
      tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
      tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } }),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const centerMap = new Map(centers.map((c) => [c.id, c]));

    const data = rows.map((r) => ({
      ...r,
      webhookPayload: undefined, // detail-only (can be large)
      studentName: studentMap.get(r.studentId)?.name ?? null,
      studentEmail: studentMap.get(r.studentId)?.email ?? null,
      courseTitle: r.courseId ? (courseMap.get(r.courseId)?.title ?? null) : null,
      centerName: r.centerId ? (centerMap.get(r.centerId)?.name ?? null) : null,
    }));

    return { data, total, page, limit };
  });
}

export async function getPaymentIntent(id: string) {
  return platformDb(async (tx) => {
    const intent = await tx.paymentIntent.findUnique({ where: { id } });
    if (!intent) throw new NotFoundError("Payment intent not found");

    const [student, course, center, payment, transaction] = await Promise.all([
      tx.user.findUnique({
        where: { id: intent.studentId },
        select: { id: true, name: true, email: true, phone: true },
      }),
      intent.courseId
        ? tx.course.findUnique({ where: { id: intent.courseId }, select: { id: true, title: true } })
        : null,
      intent.centerId
        ? tx.center.findUnique({ where: { id: intent.centerId }, select: { id: true, name: true } })
        : null,
      intent.paymentId
        ? tx.payment.findUnique({
            where: { id: intent.paymentId },
            select: { id: true, receiptNumber: true, amount: true, paidAt: true },
          })
        : null,
      intent.transactionId
        ? tx.transaction.findUnique({
            where: { id: intent.transactionId },
            select: { id: true, refNumber: true, amount: true, status: true },
          })
        : null,
    ]);

    return { ...intent, student, course, center, payment, transaction };
  });
}
