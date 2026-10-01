import { withErrors } from "../errors/http";
import { requireRole } from "./require-role";
import { platformDb } from "../db/scope";
import { ForbiddenError } from "../errors/classes";
import type { CenterStaffRole } from "@repo/database";
import type { SessionUser } from "../erp-auth/session";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const RECEPTION: readonly CenterStaffRole[] = ["receptionist", "manager"];
export const MANAGER: readonly CenterStaffRole[] = ["manager"];
export const ACCOUNTANT: readonly CenterStaffRole[] = ["center_accountant"];

export type CenterActor = {
  acting: SessionUser;
  caller: SessionUser;
  actorId: string;
  onBehalfOf: string | null;
  staffRole: CenterStaffRole | null;
};

export async function resolveCenterActorContext(
  user: SessionUser,
): Promise<{ centerId: string; staffRole: CenterStaffRole | null }> {
  if (user.role === "center_admin") {
    if (!user.centerId) throw new ForbiddenError("Center admin has no center");
    return { centerId: user.centerId, staffRole: null };
  }
  if (user.role !== "center_staff") throw new ForbiddenError();
  const link = await platformDb((tx) =>
    tx.centerStaff.findFirst({
      where: { staffUserId: user.id, removedAt: null },
      select: { centerId: true, role: true },
    }),
  );
  if (!link) throw new ForbiddenError("Staff account is not linked to a center");
  return { centerId: link.centerId, staffRole: link.role };
}

export async function authorizeCenterActor(
  user: SessionUser,
  opts?: { allow?: readonly CenterStaffRole[] },
): Promise<CenterActor> {
  const { centerId, staffRole } = await resolveCenterActorContext(user);

  if (staffRole !== null && !(opts?.allow ?? []).includes(staffRole)) {
    throw new ForbiddenError(
      `Center staff role '${staffRole}' is not allowed on this route`,
    );
  }

  return {
    acting: {
      id: user.id, // caller's own id — RLS keys on centerId, not id
      role: "center_admin", // load-bearing: scopedDb → withTenant(centerId)
      centerId,
      locale: user.locale,
      name: user.name ?? null,
      email: user.email ?? null,
    },
    caller: user,
    actorId: user.id,
    onBehalfOf: staffRole !== null ? centerId : null,
    staffRole,
  };
}

export function assertCenterActorMethodAllowed(
  staffRole: CenterStaffRole | null,
  method: string,
): void {
  if (staffRole === "center_accountant" && MUTATING.has(method)) {
    throw new ForbiddenError("Center accountant is read-only");
  }
}

export async function writeCenterStaffAudit(
  actor: CenterActor,
  pathname: string,
  method: string,
): Promise<void> {
  if (!actor.onBehalfOf) return;
  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: `center_staff.${method.toLowerCase()}`,
          targetType: "center",
          targetId: actor.onBehalfOf,
          centerId: actor.onBehalfOf,
          onBehalfOf: actor.onBehalfOf,
          afterState: { path: pathname, method, staffRole: actor.staffRole },
        },
      }),
    { actorId: actor.actorId },
  ).catch(() => {
    console.error(`[center-staff] audit write failed for ${pathname}`);
  });
}

export async function requireCenterActor(opts?: {
  allow?: readonly CenterStaffRole[];
}): Promise<CenterActor> {
  const user = await requireRole("center_admin", "center_staff");
  return authorizeCenterActor(user, opts);
}

export type CenterActorHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
  actor: CenterActor,
) => Promise<Response>;

export async function runCenterActor(
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
  handler: CenterActorHandler,
  opts?: { allow?: readonly CenterStaffRole[] },
): Promise<Response> {
  const actor = await requireCenterActor(opts);

  assertCenterActorMethodAllowed(actor.staffRole, req.method);

  const res = await handler(req, ctx, actor);

  if (MUTATING.has(req.method) && res.ok) {
    await writeCenterStaffAudit(actor, new URL(req.url).pathname, req.method);
  }

  return res;
}

export function centerStaff(
  handler: CenterActorHandler,
  opts?: { allow?: readonly CenterStaffRole[] },
) {
  return withErrors((req, ctx) => runCenterActor(req, ctx, handler, opts));
}
