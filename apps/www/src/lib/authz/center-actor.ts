import type { NextResponse } from "next/server";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { platformDb } from "@/lib/db/scope";
import { ForbiddenError } from "@/lib/errors/classes";
import type { CenterStaffRole } from "@repo/database";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Center Staff delegation — the ENTIRE authorization surface, concentrated in
 * THIS module only (the center twin of teacher-actor.ts / Step 8).
 *
 * Model (approved 2026-07-22): a center may create UNLIMITED staff, each with a
 * preset ROLE (receptionist / manager / center_accountant). Staff act ON BEHALF
 * OF the center — they are NOT co-equal center_admins. A staff member serves
 * exactly one center (partial unique on staff_user_id WHERE removed_at IS NULL).
 *
 * The design mirrors Step 8 but differs in two ways:
 *   1. SCOPING keys on the center (RLS via acting.centerId), not on acting.id.
 *      So the acting user is shaped as `center_admin` with the center's
 *      centerId; scopedDb(acting) → withTenant(centerId) → RLS binds every
 *      query to that center. The staff's OWN id stays the audit actorId.
 *   2. A preset SUB-ROLE gates which opened routes each staff member may hit.
 *
 * EXCLUSIONS ARE ENFORCED IN ONE PLACE — by OMISSION, not a per-route denylist:
 *   - Every excluded route keeps `requireRole("center_admin")` (or
 *     `super_admin`). Because requireRole is a positive allow-list,
 *     `["center_admin"].includes("center_staff") === false`, so staff get 403
 *     automatically. You never write "deny staff here"; you only OPT IN the safe
 *     routes via `centerStaff(...)` / `delegatedWithCenter(..., { staffAllow })`.
 *     A forgotten route fails CLOSED — identical to the proven Step 8 boundary.
 *   - The four hard exclusions (center-wallet withdraw / money transfer, revenue
 *     split % + base pricing edits, center account settings, and staff/co-owner
 *     management) are simply NEVER wrapped here. See the CAPABILITY MAP below
 *     for the complete list of routes that ARE opened.
 *   - Defense-in-depth: `center_accountant` is READ-ONLY — this gate rejects any
 *     mutating method for that sub-role, regardless of a route's `allow`.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Manager inherits everything a receptionist can do (superset semantics). */
export const RECEPTION: readonly CenterStaffRole[] = ["receptionist", "manager"];
export const MANAGER: readonly CenterStaffRole[] = ["manager"];
/** Read-only financial tier. Its routes are GET-only AND the gate blocks any
 *  mutation for this sub-role — belt-and-suspenders. */
export const ACCOUNTANT: readonly CenterStaffRole[] = ["center_accountant"];

/**
 * CAPABILITY MAP — the single auditable reference for the whole matrix. Each
 * opened route imports its `allow` from the constants above; everything NOT
 * listed here stays owner-only (`requireRole("center_admin")`) by omission.
 *
 * RECEPTIONIST (allow: RECEPTION) — center-only routes via `centerStaff`:
 *   center/checkin (POST), center/checkin/lookup (GET), center/checkin/suggest (GET),
 *   center/walk-in (POST), center/walk-in/resend (POST), center/temp-students (POST),
 *   center/subscriptions (POST + GET), center/wallet-topup (POST),
 *   roster/students (GET, POST), roster/students/lookup (POST),
 *   roster/students/invite (POST), roster/students/[studentId] (GET, PATCH).
 *
 * MANAGER (allow: MANAGER) — receptionist PLUS:
 *   rooms (GET, POST), rooms/[id] (PATCH, DELETE), rooms/[id]/photos (POST),
 *   reports/attendance-by-course (GET), reports/course-fill-rates (GET),
 *   reports/enrollment-funnel (GET), dashboards/admin (GET; financial fields
 *   stripped for managers), and via `delegatedWithCenter(..., { staffAllow: MANAGER })`:
 *   collaboration-requests (GET, POST, [id]/accept, [id]/reject, [id]/cancel).
 *
 * CENTER_ACCOUNTANT (allow: ACCOUNTANT, READ-ONLY):
 *   reports/revenue, reports/revenue-timeseries, reports/net-profit,
 *   reports/expenses, reports/expenses-timeseries (all GET),
 *   center/wallet (GET), center/wallet/transactions (GET), center/wallet/payouts (GET),
 *   payments (GET), payments/[id] (GET), payments/[id]/receipt (GET), expenses (GET).
 *
 * HARD EXCLUSIONS — NEVER wrapped, stay owner/super-admin-only (staff always 403):
 *   center/wallet/payout-request (withdraw), payments/[id] PATCH (refund),
 *   courses POST + courses/[id] PATCH (base pricing + split snapshot),
 *   centers/me PATCH (settings), centers/me/admins/* (co-owner mgmt),
 *   center/staff/* (staff mgmt), superadmin admin/centers/[id]/split/* (already super_admin).
 */

export type CenterActor = {
  /**
   * Center_admin-shaped session user for data scoping: role is ALWAYS
   * "center_admin" and centerId is the staff's center, so scopedDb → withTenant
   * → RLS binds every query to that center. `id` is the CALLER's own id (staff
   * or owner) so services that attribute by user.id (e.g. wallet-topup
   * recordedBy) trace to the real actor. For a real center_admin this is the
   * caller itself.
   */
  acting: SessionUser;
  /** The real caller's session (center_staff or center_admin). */
  caller: SessionUser;
  /** The real caller — audit actor. */
  actorId: string;
  /** Set only for staff: the center they act for (audit on-behalf-of). */
  onBehalfOf: string | null;
  /** The staff preset role; null when the caller is the center owner/admin. */
  staffRole: CenterStaffRole | null;
};

/**
 * THE single resolution of a center principal -> { centerId, staffRole }
 * (live link, revocation-aware). Runs under platformDb (bypass) because we do
 * not yet have a center context and the staff link lookup must not be
 * RLS-filtered. A soft-removed (removed_at set) staff member resolves to no
 * active link -> 403 on the NEXT request (requirement #6).
 */
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

/**
 * Turn an already-authenticated center principal into a CenterActor, enforcing
 * the sub-role gate (403 for a staff member whose preset role is not in
 * `allow`; the owner always passes). Split out from `requireCenterActor` so the
 * whole decision is unit-testable with a plain SessionUser (no session).
 */
export async function authorizeCenterActor(
  user: SessionUser,
  opts?: { allow?: readonly CenterStaffRole[] },
): Promise<CenterActor> {
  const { centerId, staffRole } = await resolveCenterActorContext(user);

  // Sub-role gate: the owner (staffRole === null) always passes; a staff member
  // passes only if its preset role is in this route's allow-list.
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

/**
 * The accountant READ-ONLY invariant, in ONE place: a center_accountant may
 * never run a mutating method, regardless of a route's `allow`. Belt-and-
 * suspenders — accountant routes are GET-only anyway.
 */
export function assertCenterActorMethodAllowed(
  staffRole: CenterStaffRole | null,
  method: string,
): void {
  if (staffRole === "center_accountant" && MUTATING.has(method)) {
    throw new ForbiddenError("Center accountant is read-only");
  }
}

/** Write the on-behalf-of audit row for a staff mutation (one choke point). */
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
    // Attribution must never break the action itself; the action already
    // succeeded. (Monitoring picks up audit failures via logs.)
    console.error(`[center-staff] audit write failed for ${pathname}`);
  });
}

/**
 * Resolve the current caller into a CenterActor (403 for anyone else, and 403
 * for a staff member whose sub-role is not in `allow`).
 */
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
) => Promise<NextResponse>;

/**
 * The SINGLE runner behind both `centerStaff` (center-only routes) and the
 * center branch of `delegatedWithCenter` (shared teacher/center routes).
 * Resolves the actor, enforces the READ-ONLY invariant for center_accountant,
 * runs the handler, and writes the on-behalf-of audit row on a successful
 * mutating call — one choke point audits every delegated center-staff mutation.
 */
export async function runCenterActor(
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
  handler: CenterActorHandler,
  opts?: { allow?: readonly CenterStaffRole[] },
): Promise<NextResponse> {
  const actor = await requireCenterActor(opts);

  // Accountant is READ-ONLY, enforced HERE regardless of the route's allow.
  assertCenterActorMethodAllowed(actor.staffRole, req.method);

  const res = await handler(req, ctx, actor);

  // One choke point audits every delegated center-staff mutation.
  if (MUTATING.has(req.method) && res.ok) {
    await writeCenterStaffAudit(actor, new URL(req.url).pathname, req.method);
  }

  return res;
}

/**
 * Route gate for center-only endpoints. Replaces `requireRole("center_admin")`
 * on a route we deliberately OPEN to staff. The center owner (center_admin)
 * always passes; a staff member passes only if its preset role is in `allow`.
 * Mutations by staff are audited on-behalf-of the center.
 *
 *   export const POST = centerStaff(async (req, ctx, { acting }) => { ... },
 *     { allow: RECEPTION });
 */
export function centerStaff(
  handler: CenterActorHandler,
  opts?: { allow?: readonly CenterStaffRole[] },
) {
  return withErrors((req, ctx) => runCenterActor(req, ctx, handler, opts));
}
