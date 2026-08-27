import { platformDb } from "../../db/scope";
import { ForbiddenError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { Prisma } from "@repo/database";

const PAGE_MAX = 100;

export type CenterAuditFilters = {
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

export type CenterAuditRow = {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  beforeState: unknown;
  afterState: unknown;
  onBehalfOf: string | null;
  onBehalfOfName: string | null;
  createdAt: Date;
};

export function listCenterAuditLogs(acting: SessionUser, filters: CenterAuditFilters) {
  const centerId = acting.centerId;
  if (!centerId) throw new ForbiddenError("Actor has no center scope");

  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, parseInt(filters.limit ?? "50", 10) || 50));

  return platformDb(async (tx) => {
    const where: Prisma.AuditLogWhereInput = { centerId };

    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.action?.trim()) where.action = { startsWith: filters.action.trim() };

    if (filters.from || filters.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.from) createdAt.gte = new Date(filters.from);
      if (filters.to) {
        const to = new Date(filters.to);
        if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to)) to.setUTCHours(23, 59, 59, 999);
        createdAt.lte = to;
      }
      where.createdAt = createdAt;
    }

    const [rows, total] = await Promise.all([
      tx.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.auditLog.count({ where }),
    ]);

    const ids = [
      ...new Set(
        [...rows.map((r) => r.actorId), ...rows.map((r) => r.onBehalfOf)].filter(Boolean) as string[],
      ),
    ];
    const people = ids.length
      ? await tx.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, role: true },
        })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorId: r.actorId,
        actorName: r.actorId ? (byId.get(r.actorId)?.name ?? null) : null,
        actorRole: r.actorId ? (byId.get(r.actorId)?.role ?? null) : null,
        targetType: r.targetType,
        targetId: r.targetId,
        beforeState: r.beforeState,
        afterState: r.afterState,
        onBehalfOf: r.onBehalfOf,
        onBehalfOfName: r.onBehalfOf ? (byId.get(r.onBehalfOf)?.name ?? null) : null,
        createdAt: r.createdAt,
      })) satisfies CenterAuditRow[],
      total,
      page,
      limit,
    };
  });
}

export function listCenterAuditActors(acting: SessionUser) {
  const centerId = acting.centerId;
  if (!centerId) throw new ForbiddenError("Actor has no center scope");

  return platformDb(async (tx) => {
    const rows = await tx.auditLog.findMany({
      where: { centerId, actorId: { not: null } },
      distinct: ["actorId"],
      select: { actorId: true },
      take: 200,
    });
    const ids = rows.map((r) => r.actorId).filter(Boolean) as string[];
    if (ids.length === 0) return [];

    const people = await tx.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return people;
  });
}

export function listCenterAuditActions(acting: SessionUser) {
  const centerId = acting.centerId;
  if (!centerId) throw new ForbiddenError("Actor has no center scope");

  return platformDb(async (tx) => {
    const rows = await tx.auditLog.findMany({
      where: { centerId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
      take: 200,
    });
    return rows.map((r) => r.action);
  });
}
