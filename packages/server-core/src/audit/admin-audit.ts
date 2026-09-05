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
}

export function recordAdminAudit(actor: SessionUser, spec: AdminAuditSpec): Promise<void> {
  return platformDb((tx) => writeAdminAudit(tx, actor, spec), { actorId: actor.id });
}
