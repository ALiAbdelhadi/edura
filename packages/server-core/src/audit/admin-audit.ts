import { platformDb, type TenantTx } from "../db/scope";
import type { SessionUser } from "../auth/types";

export type AdminAuditSpec = {
  action: string;
  targetType: string;
  targetId: string;
  centerId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Caller IP when the wrapper has a request to read it from (admin-users). */
  ipAddress?: string | null;
};

export type AdminAuditListener = (spec: AdminAuditSpec) => void;

// Listeners run after an audit row is written. The registry lives on globalThis
// under a Symbol.for key, not in module scope, because an app registers from
// its instrumentation.ts — a separate bundle entry from the route handlers that
// write audits — and a module-level Set could be two different Sets in one
// process. Empty unless an app registers something, so the ERP, the DB suites
// and every script behave exactly as before.
const LISTENERS = Symbol.for("@repo/server-core/admin-audit-listeners");

function listeners(): Set<AdminAuditListener> {
  const g = globalThis as unknown as Record<symbol, Set<AdminAuditListener> | undefined>;
  return (g[LISTENERS] ??= new Set());
}

export function onAdminAudit(listener: AdminAuditListener): () => void {
  listeners().add(listener);
  return () => listeners().delete(listener);
}

// `actor` needs only an id: platform.ts and friends are handed a bare
// `adminId` string by their routes, and a fake SessionUser built around it
// would be a lie the type system then trusts.
export async function writeAdminAudit(
  tx: TenantTx,
  actor: Pick<SessionUser, "id">,
  spec: AdminAuditSpec,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      action: spec.action,
      targetType: spec.targetType,
      targetId: spec.targetId,
      centerId: spec.centerId ?? null,
      beforeState: (spec.before ?? undefined) as never,
      afterState: (spec.after ?? undefined) as never,
      ...(spec.ipAddress !== undefined ? { ipAddress: spec.ipAddress } : {}),
      onBehalfOf: null,
    },
  });
  // A listener is best-effort by contract and must never fail the write it was
  // told about — the audit row and the change it records are already in this
  // transaction.
  for (const listener of listeners()) {
    try {
      listener(spec);
    } catch (err) {
      console.error("[admin-audit] listener failed", err);
    }
  }
}

export function recordAdminAudit(actor: SessionUser, spec: AdminAuditSpec): Promise<void> {
  return platformDb((tx) => writeAdminAudit(tx, actor, spec), { actorId: actor.id });
}
