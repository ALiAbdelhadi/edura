import { platformDb } from "../../db/scope";
import { exactQuery, narrowQuery } from "@repo/database/search-text";
import type { Prisma } from "@repo/database";
import { parsePageLimit } from "../../validation/common";

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
  const { page, limit } = parsePageLimit(filters, 20);

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
          AND: exactQuery(q, (t) => ({ searchText: { contains: t } })),
        },
        select: { id: true },
        take: 500,
      });

      where.OR = [
        { studentId: { in: students.map((s) => s.id) } },
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

