import { platformDb } from "../db/scope";
import { NotFoundError } from "../errors/classes";
import type { SessionUser } from "../auth/types";

export type CenterTarget = {
  acting: SessionUser;
  centerId: string;
  centerName: string;
};

export async function superadminAsCenter(
  actor: SessionUser,
  centerId: string,
): Promise<CenterTarget> {
  const center = await platformDb((tx) =>
    tx.center.findUnique({ where: { id: centerId }, select: { id: true, name: true } }),
  );
  if (!center) throw new NotFoundError("Center not found");

  return {
    acting: {
      id: actor.id, // the real actor — attribution, not impersonation
      role: "center_admin", // load-bearing: scopedDb → withTenant(centerId)
      centerId: center.id,
      locale: actor.locale,
      name: actor.name ?? null,
      email: actor.email ?? null,
    } as SessionUser,
    centerId: center.id,
    centerName: center.name,
  };
}
