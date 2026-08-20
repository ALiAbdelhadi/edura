import { platformDb } from "@/lib/db/scope";
import {
  matchesSearchTerms,
  narrowQuery,
  searchTerms,
} from "@repo/database/search-text";
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
      const terms = searchTerms(q);

      // The PAYER lookup gets the FULL two-stage match — narrow in SQL, decide
      // in JS — because it is a bounded sub-query, not a page: «احمد» used to
      // match none of the rows stored «أحمد», so an intent could not be found
      // by the name of the person who paid for it. The JS pass runs over the
      // 500-row cap this query already had.
      const candidates = await tx.user.findMany({
        where: {
          role: "student",
          AND: narrowQuery(q, (f) => [
            { name: { contains: f, mode: "insensitive" as const } },
            { email: { contains: f, mode: "insensitive" as const } },
          ]),
        },
        select: { id: true, name: true, email: true },
        take: 500,
      });
      const students = candidates.filter((s) =>
        matchesSearchTerms([s.name, s.email], terms),
      );

      // The GATEWAY references narrow only. This query is offset-paginated and
      // returns a `count`, so a JS filter after the page is cut would give a
      // short page and a wrong total — the same trade recorded in `listUsers`.
      // Gateway references are ASCII anyway, so the fragments are the whole
      // string and the narrowing is exact for them in practice.
      where.OR = [
        { studentId: { in: students.map((s) => s.id) } },
        // ONE clause, not spread — the fragments must stay ANDed WITHIN the
        // reference branch so a second typed word narrows it. Spreading them
        // into the outer OR would have made «احمد محمد» match a reference
        // containing either. `narrowQuery` (not `narrowFragments`) because an
        // empty `AND` is Prisma's "no constraint", which here would have listed
        // EVERY intent on the platform for an unnarrowable query.
        {
          AND: narrowQuery(q, (f) => [
            { gatewayOrderId: { contains: f, mode: "insensitive" as const } },
            { gatewayRef: { contains: f, mode: "insensitive" as const } },
            { idempotencyKey: { contains: f, mode: "insensitive" as const } },
          ]),
        },
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

    // studentId is nullable (a parent wallet top-up has no beneficiary student)
    // and payerUserId is set whenever someone other than the student paid, so
    // both are resolved and both can legitimately be absent on a given row.
    const studentIds = [...new Set(rows.map((r) => r.studentId).filter(Boolean) as string[])];
    const payerIds = [...new Set(rows.map((r) => r.payerUserId).filter(Boolean) as string[])];
    const courseIds = [...new Set(rows.map((r) => r.courseId).filter(Boolean) as string[])];
    const centerIds = [...new Set(rows.map((r) => r.centerId).filter(Boolean) as string[])];
    const [students, payers, courses, centers] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, email: true },
      }),
      payerIds.length
        ? tx.user.findMany({
            where: { id: { in: payerIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
      tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
      tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } }),
    ]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const payerMap = new Map(payers.map((p) => [p.id, p]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const centerMap = new Map(centers.map((c) => [c.id, c]));

    const data = rows.map((r) => ({
      ...r,
      webhookPayload: undefined, // detail-only (can be large)
      studentName: r.studentId ? (studentMap.get(r.studentId)?.name ?? null) : null,
      studentEmail: r.studentId ? (studentMap.get(r.studentId)?.email ?? null) : null,
      payerName: r.payerUserId ? (payerMap.get(r.payerUserId)?.name ?? null) : null,
      payerEmail: r.payerUserId ? (payerMap.get(r.payerUserId)?.email ?? null) : null,
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

    const [student, payer, course, center, payment, transaction] = await Promise.all([
      // Absent on a parent wallet top-up, which has no beneficiary student.
      intent.studentId
        ? tx.user.findUnique({
            where: { id: intent.studentId },
            select: { id: true, name: true, email: true, phone: true },
          })
        : null,
      // Set whenever someone other than the student paid (a parent).
      intent.payerUserId
        ? tx.user.findUnique({
            where: { id: intent.payerUserId },
            select: { id: true, name: true, email: true, phone: true },
          })
        : null,
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

    return { ...intent, student, payer, course, center, payment, transaction };
  });
}
