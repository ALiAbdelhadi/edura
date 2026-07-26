import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// SUPERADMIN "ACT AS CENTER" — the back-office twin of
// apps/www/src/lib/authz/center-actor.ts.
//
// A super admin has no centerId of their own, so to run a center capability
// they are re-shaped into a center_admin carrying the TARGET center's id:
//
//     { id: <the super admin's OWN id>, role: "center_admin", centerId: <target> }
//
// Two things are load-bearing about that shape:
//   • `role: "center_admin"` + `centerId` is what makes `scopedDb(acting)`
//     resolve to `withTenant(centerId)`, so RLS binds every query in the
//     kernel service to that one center. Acting on center A therefore cannot
//     touch center B even if a service forgot a filter.
//   • `id` stays the SUPER ADMIN's own id, never a center admin's. Services
//     that attribute by `user.id` (recordedBy, blacklistedBy, enrolledBy …)
//     then record the real human who acted. This is the same choice the
//     center-staff actor makes, and the reason no impersonation is involved:
//     the super admin acts as themselves, with the center's scope.
//
// Authorization is NOT here. Every route calls `requireRole("super_admin")`
// first; this module only resolves and shapes a target that exists.
// ---------------------------------------------------------------------------

export type CenterTarget = {
  /** center_admin-shaped user for the kernel services (RLS scope). */
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
