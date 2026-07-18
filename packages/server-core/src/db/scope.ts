import {
  prisma,
  withTenant,
  withPlatformContext,
  runWithContext,
  type TenantTx,
} from "@repo/database";
import type { SessionUser } from "../auth/types";

export { prisma };
export type { TenantTx };

export function scopedDb<T>(
  user: SessionUser | null | undefined,
  fn: (tx: TenantTx) => Promise<T>,
  opts?: { ipAddress?: string },
): Promise<T> {
  const ctx = {
    actorId: user?.id,
    centerId: user?.centerId,
    ipAddress: opts?.ipAddress,
  };
  const exec: (f: (tx: TenantTx) => Promise<T>) => Promise<T> =
    user?.role === "center_admin" && user.centerId
      ? (f) => withTenant(user.centerId as string, f)
      : (f) => withPlatformContext(f);
  return runWithContext(ctx, () => exec(fn));
}

export function platformDb<T>(
  fn: (tx: TenantTx) => Promise<T>,
  ctx?: { actorId?: string; ipAddress?: string },
): Promise<T> {
  return runWithContext(ctx ?? {}, () => withPlatformContext(fn));
}
