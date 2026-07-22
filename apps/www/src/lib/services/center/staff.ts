// Center staff management (owner-only): staff are real user accounts
// (role=center_staff) created/linked by the center owner. Mirrors
// teacher/assistants.ts (Step 8), adding a preset sub-role + center scoping.
//
// This service is reached ONLY from the owner-gated CRUD routes
// (requireRole("center_admin")). Staff can never manage other staff — those
// routes are never opened via center-actor, so a center_staff caller 403s by
// default-closed design (hard exclusion #4).
import bcrypt from "bcryptjs";
import { platformDb, scopedDb } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import type { CenterStaffRole } from "@repo/database";

const STAFF_ROLES: readonly CenterStaffRole[] = [
  "receptionist",
  "manager",
  "center_accountant",
];

function ownerCenterId(owner: SessionUser): string {
  if (owner.role !== "center_admin" || !owner.centerId) {
    throw new ForbiddenError();
  }
  return owner.centerId;
}

function assertValidRole(role: string): asserts role is CenterStaffRole {
  if (!STAFF_ROLES.includes(role as CenterStaffRole)) {
    throw new BusinessRuleError("Invalid staff role");
  }
}

export async function listStaff(owner: SessionUser) {
  const centerId = ownerCenterId(owner);
  return scopedDb(owner, async (tx) => {
    // All staff (active + soft-removed) so the owner UI can show inactive rows
    // and reactivate them. RLS binds this read to the owner's center.
    const links = await tx.centerStaff.findMany({
      where: { centerId },
      orderBy: [{ removedAt: "asc" }, { createdAt: "asc" }],
    });
    if (!links.length) return [];
    const users = await tx.user.findMany({
      where: { id: { in: links.map((l) => l.staffUserId) } },
      select: { id: true, name: true, email: true, phone: true, status: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return links.map((l) => ({
      id: l.id,
      staffUserId: l.staffUserId,
      role: l.role,
      title: l.title,
      active: l.removedAt === null,
      createdAt: l.createdAt,
      user: userMap.get(l.staffUserId) ?? null,
    }));
  });
}

export async function createStaff(
  owner: SessionUser,
  input: {
    name: string;
    email: string;
    password: string;
    role: CenterStaffRole;
    title?: string;
  },
) {
  const centerId = ownerCenterId(owner);
  assertValidRole(input.role);
  const email = input.email.toLowerCase().trim();

  // Global user ops run under platformDb (users has no RLS; email uniqueness is
  // global) — the walk-in precedent. The center_staff link carries an explicit
  // centerId so tenant attribution is unambiguous.
  return platformDb(
    async (tx) => {
      let staffUser = await tx.user.findUnique({ where: { email } });

      if (staffUser) {
        if (staffUser.role !== "center_staff") {
          throw new ConflictError(
            "This email belongs to an existing account with a different role",
          );
        }
        if (staffUser.deletedAt || staffUser.status !== "active") {
          throw new BusinessRuleError("This staff account is not active");
        }
        // Partial unique: one ACTIVE center per staff user. Detect an active
        // link elsewhere and give a clear message instead of a raw P2002.
        const activeElsewhere = await tx.centerStaff.findFirst({
          where: { staffUserId: staffUser.id, removedAt: null, NOT: { centerId } },
          select: { id: true },
        });
        if (activeElsewhere) {
          throw new BusinessRuleError(
            "This staff account is already active at another center",
          );
        }
        const existing = await tx.centerStaff.findUnique({
          where: { centerId_staffUserId: { centerId, staffUserId: staffUser.id } },
        });
        if (existing && !existing.removedAt) {
          throw new ConflictError("This staff member is already on your team");
        }
        if (existing) {
          // Re-activate a previously removed membership, refreshing role/title.
          const link = await tx.centerStaff.update({
            where: { id: existing.id },
            data: {
              removedAt: null,
              role: input.role,
              title: input.title?.trim() || existing.title,
            },
          });
          return { link, user: staffUser, existingAccount: true };
        }
      } else {
        staffUser = await tx.user.create({
          data: {
            email,
            name: input.name.trim(),
            role: "center_staff",
            status: "active",
            passwordHash: await bcrypt.hash(input.password, 10),
          },
        });
      }

      const link = await tx.centerStaff.create({
        data: {
          centerId,
          staffUserId: staffUser.id,
          role: input.role,
          title: input.title?.trim() || null,
        },
      });
      return { link, user: staffUser, existingAccount: false };
    },
    { actorId: owner.id },
  );
}

export async function updateStaff(
  owner: SessionUser,
  linkId: string,
  patch: { role?: CenterStaffRole; title?: string | null; active?: boolean },
) {
  const centerId = ownerCenterId(owner);
  if (patch.role !== undefined) assertValidRole(patch.role);

  return scopedDb(owner, async (tx) => {
    const link = await tx.centerStaff.findFirst({
      where: { id: linkId, centerId },
    });
    if (!link) throw new NotFoundError("Staff member not found on your team");

    const data: {
      role?: CenterStaffRole;
      title?: string | null;
      removedAt?: Date | null;
    } = {};
    if (patch.role !== undefined) data.role = patch.role;
    if (patch.title !== undefined) data.title = patch.title?.trim() || null;

    if (patch.active === true && link.removedAt !== null) {
      // Reactivating: enforce the partial unique globally (RLS would hide an
      // active link at another center, so check under platformDb).
      const activeElsewhere = await platformDb((ptx) =>
        ptx.centerStaff.findFirst({
          where: {
            staffUserId: link.staffUserId,
            removedAt: null,
            NOT: { id: link.id },
          },
          select: { id: true },
        }),
      );
      if (activeElsewhere) {
        throw new BusinessRuleError(
          "This staff account is already active at another center",
        );
      }
      data.removedAt = null;
    } else if (patch.active === false && link.removedAt === null) {
      data.removedAt = new Date();
    }

    const updated = await tx.centerStaff.update({
      where: { id: link.id },
      data,
    });
    return {
      id: updated.id,
      staffUserId: updated.staffUserId,
      role: updated.role,
      title: updated.title,
      active: updated.removedAt === null,
    };
  });
}

export async function removeStaff(owner: SessionUser, linkId: string) {
  const centerId = ownerCenterId(owner);
  return scopedDb(owner, async (tx) => {
    const link = await tx.centerStaff.findFirst({
      where: { id: linkId, centerId, removedAt: null },
    });
    if (!link) throw new NotFoundError("Staff member not found on your team");
    await tx.centerStaff.update({
      where: { id: link.id },
      data: { removedAt: new Date() },
    });
    return { removed: true };
  });
}

/**
 * The staff member's own view of their delegation — drives the portal nav and
 * acts as a live, revocation-aware guard (a deactivated staff gets 403 → the
 * portal redirects to login on the next request).
 */
export async function getStaffMe(user: SessionUser) {
  if (user.role !== "center_staff") throw new ForbiddenError();
  return platformDb(async (tx) => {
    const link = await tx.centerStaff.findFirst({
      where: { staffUserId: user.id, removedAt: null },
      select: { role: true, centerId: true, title: true },
    });
    if (!link) throw new ForbiddenError("Staff account is not linked to a center");
    const center = await tx.center.findUnique({
      where: { id: link.centerId },
      select: { name: true },
    });
    return {
      role: link.role,
      title: link.title,
      centerId: link.centerId,
      centerName: center?.name ?? null,
    };
  });
}
