import { platformDb } from "../../db/scope";
import type { Prisma } from "@repo/database";
import { parsePageLimit } from "../../validation/common";

export type AuditFilters = {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  centerId?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

export function listAuditLogs(filters: AuditFilters) {
  const { page, limit } = parsePageLimit(filters, 50);

  return platformDb(async (tx) => {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.action?.trim()) where.action = { startsWith: filters.action.trim() };
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.targetId) where.targetId = filters.targetId;
    if (filters.centerId) where.centerId = filters.centerId;
    if (filters.from || filters.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.from) createdAt.gte = new Date(filters.from);
      if (filters.to) createdAt.lte = new Date(filters.to);
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

    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])];
    const actors = actorIds.length
      ? await tx.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    const onBehalfIds = [...new Set(rows.map((r) => r.onBehalfOf).filter(Boolean) as string[])];
    const principals = onBehalfIds.length
      ? await tx.user.findMany({
          where: { id: { in: onBehalfIds } },
          select: { id: true, name: true },
        })
      : [];
    const principalById = new Map(principals.map((p) => [p.id, p.name]));

    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorId: r.actorId,
        actorName: r.actorId ? (actorById.get(r.actorId)?.name ?? null) : null,
        actorRole: r.actorId ? (actorById.get(r.actorId)?.role ?? null) : null,
        targetType: r.targetType,
        targetId: r.targetId,
        centerId: r.centerId,
        beforeState: r.beforeState,
        afterState: r.afterState,
        onBehalfOf: r.onBehalfOf,
        onBehalfOfName: r.onBehalfOf ? (principalById.get(r.onBehalfOf) ?? null) : null,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt,
      })),
      total,
      page,
      limit,
    };
  });
}

/**
 * The distinct `action` values present in the audit log.
 *
 * `groupBy` rather than `findMany({ distinct })`: Prisma applies `distinct`
 * in memory, AFTER `take`, so a `take: 300` on an append-only table returned
 * the distinct actions of the newest 300 ROWS -- a list that silently shrank
 * as the table grew. The grouping happens in the database here, so the answer
 * is exact and the 300 is a cap on distinct actions, not on rows scanned.
 */
export function listAuditActions() {
  return platformDb(async (tx) => {
    const rows = await tx.auditLog.groupBy({
      by: ["action"],
      orderBy: { action: "asc" },
      take: 300,
    });
    return rows.map((r) => r.action);
  });
}
