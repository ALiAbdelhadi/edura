import { platformDb } from "../../db/scope";
import { exactQuery } from "@repo/database/search-text";
import type { Prisma } from "@repo/database";
import { parsePageLimit } from "../../validation/common";

export type SubscriptionListFilters = {
  q?: string; // student name/email or course title
  status?: string;
  plan?: string;
  source?: string;
  targetType?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

const STATUSES = new Set(["pending_payment", "active", "expired", "cancelled"]);
const PLANS = new Set(["monthly", "per_session"]);
const SOURCES = new Set(["online", "walk_in"]);
const TARGETS = new Set(["teacher", "center"]);

export async function listSubscriptions(filters: SubscriptionListFilters) {
  const { page, limit } = parsePageLimit(filters, 20);

  return platformDb(async (tx) => {
    const where: Prisma.SubscriptionWhereInput = {};
    if (filters.status && STATUSES.has(filters.status)) where.status = filters.status as never;
    if (filters.plan && PLANS.has(filters.plan)) where.plan = filters.plan as never;
    if (filters.source && SOURCES.has(filters.source)) where.source = filters.source as never;
    if (filters.targetType && TARGETS.has(filters.targetType)) {
      where.targetType = filters.targetType as never;
    }
    if (filters.from || filters.to) {
      const range: Prisma.DateTimeFilter = {};
      if (filters.from) range.gte = new Date(filters.from);
      if (filters.to) range.lte = new Date(filters.to);
      where.createdAt = range;
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      const [students, courses] = await Promise.all([
        tx.user.findMany({
          where: {
            role: "student",
            AND: exactQuery(q, (t) => ({ searchText: { contains: t } })),
          },
          select: { id: true },
          take: 500,
        }),
        tx.course.findMany({
          where: { AND: exactQuery(q, (t) => ({ searchText: { contains: t } })) },
          select: { id: true },
          take: 500,
        }),
      ]);

      where.OR = [
        { studentId: { in: students.map((s) => s.id) } },
        { courseId: { in: courses.map((c) => c.id) } },
      ];
    }

    const [rows, total] = await Promise.all([
      tx.subscription.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.subscription.count({ where }),
    ]);

    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const courseIds = [...new Set(rows.map((r) => r.courseId))];
    const centerIds = [...new Set(rows.map((r) => r.centerId).filter(Boolean) as string[])];
    const [users, courses, centers] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: [...studentIds, ...teacherIds] } },
        select: { id: true, name: true, email: true },
      }),
      tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
      tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const centerMap = new Map(centers.map((c) => [c.id, c]));

    const data = rows.map((r) => ({
      ...r,
      studentName: userMap.get(r.studentId)?.name ?? null,
      studentEmail: userMap.get(r.studentId)?.email ?? null,
      teacherName: userMap.get(r.teacherId)?.name ?? null,
      courseTitle: courseMap.get(r.courseId)?.title ?? null,
      centerName: r.centerId ? (centerMap.get(r.centerId)?.name ?? null) : null,
    }));

    return { data, total, page, limit };
  });
}

