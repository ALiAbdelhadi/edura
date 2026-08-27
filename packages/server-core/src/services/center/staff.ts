import type { SessionUser } from "../../auth/types";
import { platformDb, scopedDb } from "../../db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { CenterStaffRole } from "@repo/database";
import { staffInviteEmail } from "../../mail/templates";
import { claimLink, issueInvite } from "../../services/invites/invite-token";
import {
  deliverInviteEmail,
  inviteExpiryDays,
  type DeliveryResult,
} from "../../services/invites/deliver";

export type InviteOutcome = {
  email: DeliveryResult;
  claimLink: string;
  expiresAt: Date;
};

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
    const links = await tx.centerStaff.findMany({
      where: { centerId },
      orderBy: [{ removedAt: "asc" }, { createdAt: "asc" }],
    });
    if (!links.length) return [];
    const users = await tx.user.findMany({
      where: { id: { in: links.map((l) => l.staffUserId) } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        passwordHash: true,
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return links.map((l) => {
      const u = userMap.get(l.staffUserId);
      return {
        id: l.id,
        staffUserId: l.staffUserId,
        role: l.role,
        title: l.title,
        active: l.removedAt === null,
        createdAt: l.createdAt,
        pendingClaim: !!u && u.passwordHash === null,
        user: u
          ? {
              id: u.id,
              name: u.name,
              email: u.email,
              phone: u.phone,
              status: u.status,
            }
          : null,
      };
    });
  });
}

export async function createStaff(
  owner: SessionUser,
  input: {
    name: string;
    email: string;
    role: CenterStaffRole;
    title?: string;
    locale?: "ar" | "en";
  },
): Promise<{
  link: { id: string; role: CenterStaffRole; title: string | null };
  user: { id: string; name: string; email: string | null; status: string };
  existingAccount: boolean;
  invite: InviteOutcome | null;
}> {
  const centerId = ownerCenterId(owner);
  assertValidRole(input.role);
  const email = input.email.toLowerCase().trim();
  const locale = input.locale ?? "ar";

  const { link, user, existingAccount, needsInvite } = await platformDb(
    async (tx) => {
      let staffUser = await tx.user.findUnique({ where: { email } });

      if (staffUser) {
        if (staffUser.role !== "center_staff") {
          throw new ConflictError(
            "This email belongs to an existing account with a different role",
          );
        }
        if (staffUser.deletedAt || !["active", "shell"].includes(staffUser.status)) {
          throw new BusinessRuleError("This staff account is not active");
        }
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
          const relink = await tx.centerStaff.update({
            where: { id: existing.id },
            data: {
              removedAt: null,
              role: input.role,
              title: input.title?.trim() || existing.title,
            },
          });
          return {
            link: relink,
            user: staffUser,
            existingAccount: true,
            needsInvite: staffUser.passwordHash === null,
          };
        }
      } else {
        staffUser = await tx.user.create({
          data: {
            email,
            name: input.name.trim(),
            role: "center_staff",
            status: "shell",
            passwordHash: null,
          },
        });
      }

      const created = await tx.centerStaff.create({
        data: {
          centerId,
          staffUserId: staffUser.id,
          role: input.role,
          title: input.title?.trim() || null,
        },
      });
      return {
        link: created,
        user: staffUser,
        existingAccount: !!staffUser.passwordHash,
        needsInvite: staffUser.passwordHash === null,
      };
    },
    { actorId: owner.id },
  );

  const invite = needsInvite
    ? await sendStaffInvite(
        { id: user.id, name: user.name, email: user.email },
        owner,
        centerId,
        link.role,
        locale,
      )
    : null;

  return {
    link: { id: link.id, role: link.role, title: link.title },
    user: { id: user.id, name: user.name, email: user.email, status: user.status },
    existingAccount,
    invite,
  };
}

async function sendStaffInvite(
  staff: { id: string; name: string; email: string | null },
  owner: SessionUser,
  centerId: string,
  staffRole: CenterStaffRole,
  locale: "ar" | "en",
): Promise<InviteOutcome> {
  const { token, expiresAt } = await issueInvite({
    userId: staff.id,
    purpose: "center_staff_invite",
    centerId,
    email: staff.email,
    actorId: owner.id,
  });
  const link = claimLink(token, locale);

  const centerName = await platformDb(
    async (tx) =>
      (await tx.center.findUnique({ where: { id: centerId }, select: { name: true } }))
        ?.name ?? "",
    { actorId: owner.id },
  );

  const email = staff.email
    ? await deliverInviteEmail({
        to: staff.email,
        ...staffInviteEmail({
          locale,
          link,
          staffName: staff.name,
          centerName,
          staffRole,
          expiryDays: inviteExpiryDays(),
        }),
      })
    : ({ status: "no_recipient" } as DeliveryResult);

  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "center_staff.invited",
          targetType: "user",
          targetId: staff.id,
          centerId,
          afterState: { email: staff.email, role: staffRole, delivery: email.status },
        },
      }),
    { actorId: owner.id },
  );

  return { email, claimLink: link, expiresAt };
}

export async function resendStaffInvite(
  owner: SessionUser,
  linkId: string,
  locale: "ar" | "en" = "ar",
): Promise<InviteOutcome> {
  const centerId = ownerCenterId(owner);
  const { staff, staffRole } = await scopedDb(owner, async (tx) => {
    const link = await tx.centerStaff.findFirst({
      where: { id: linkId, centerId, removedAt: null },
    });
    if (!link) throw new NotFoundError("Staff member not found on your team");
    const user = await tx.user.findUnique({
      where: { id: link.staffUserId },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
    if (!user) throw new NotFoundError("Staff account not found");
    if (user.passwordHash !== null) {
      throw new BusinessRuleError(
        "This staff member has already set a password — ask them to use 'forgot password'",
      );
    }
    return { staff: user, staffRole: link.role };
  });

  return sendStaffInvite(staff, owner, centerId, staffRole, locale);
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
