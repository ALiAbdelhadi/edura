import { platformDb } from "../../db/scope";
import { ForbiddenError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { Prisma } from "@repo/database";

// ===========================================================================
// CENTER-OWNER AUDIT VIEWER — the same immutable log the back office reads,
// narrowed to ONE center and to the actions that center is entitled to see.
//
// `audit_logs` carries REVOKE UPDATE, DELETE for the application role, so this
// record cannot be edited or erased from any surface. That guarantee is what
// makes it worth showing a center owner at all: they are being asked to trust
// a log about their own staff, and a log their landlord could rewrite would be
// worthless to them.
//
// THREE NARROWINGS, each deliberate:
//
// 1. CENTER SCOPE IS SERVER-SIDE AND NOT CALLER-SUPPLIED. The centerId comes
//    from the acting session, never from a query parameter. A center owner
//    cannot request another center's log by editing a URL, because there is no
//    parameter to edit.
//
// 2. NULL-CENTER ROWS ARE INVISIBLE HERE. Platform-level actions (a super
//    admin suspending a user, a feature flag flip, a contact triage) carry
//    `center_id IS NULL`. Those are the platform's business, and an `IS NULL`
//    row must never leak into a tenant's view through a forgotten filter — so
//    the filter is an equality on a non-null value, which cannot match NULL.
//
// 3. THE ACTOR IS RESOLVED TO A NAME, AND NEVER LEFT BLANK. An unattributed
//    action in an audited system is a gap the interface should not create;
//    an automated write reads as "the system", not as an empty cell.
//
// This module is READ-ONLY and structurally so: it calls findMany and count,
// and imports nothing that mutates.
// ===========================================================================

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
  // The scope is the session's, not the request's.
  const centerId = acting.centerId;
  if (!centerId) throw new ForbiddenError("Actor has no center scope");

  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, parseInt(filters.limit ?? "50", 10) || 50));

  // Platform context on purpose: `audit_logs` has no RLS policy of its own, and
  // the narrowing that matters is the explicit `centerId` equality below —
  // stated here rather than left to be inferred.
  return platformDb(async (tx) => {
    const where: Prisma.AuditLogWhereInput = { centerId };

    if (filters.actorId) where.actorId = filters.actorId;
    // Prefix match, so "center." pulls every center action in one filter.
    if (filters.action?.trim()) where.action = { startsWith: filters.action.trim() };

    if (filters.from || filters.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.from) createdAt.gte = new Date(filters.from);
      if (filters.to) {
        // A date-only "to" means the END of that day. Without this, filtering
        // "to today" silently excludes everything that happened today.
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

/**
 * The people who appear as actors in THIS center's log — powers the actor
 * filter. Derived from the log itself rather than from the staff roster, so a
 * member who has since left still shows up: their actions did not stop having
 * happened.
 */
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

/** The distinct action names present in this center's log. */
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
