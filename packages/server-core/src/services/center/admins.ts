import { scopedDb } from "../../db/scope";
import { runEffects, type WithEffects } from "../../db/effects";
import type { TenantTx } from "@repo/database";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { notify } from "../notifications/notify";
import { sendMail } from "../../mail/send";
import { generateOpaqueToken, hashToken } from "../../utils/random";

const INVITE_EXPIRY_HOURS = 7 * 24;

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

export async function listCenterAdmins(acting: SessionUser) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    const profiles = await tx.centerAdminProfile.findMany({
      where: { centerId },
      select: { userId: true },
    });
    const userIds = profiles.map((p) => p.userId);
    return tx.user.findMany({
      where: { id: { in: userIds }, status: { not: "deleted" } },
      select: { id: true, name: true, email: true, status: true },
    });
  });
}

export async function removeCenterAdmin(
  acting: SessionUser,
  userId: string,
  selfId: string | null,
) {
  const centerId = centerOf(acting);
  if (selfId && selfId === userId) {
    throw new ForbiddenError("You cannot remove yourself as admin");
  }

  return scopedDb(acting, (tx) => removeCenterAdminTx(tx, acting, userId, selfId));
}

export async function removeCenterAdminTx(
  tx: TenantTx,
  acting: SessionUser,
  userId: string,
  selfId: string | null,
) {
  const centerId = centerOf(acting);
  if (selfId && selfId === userId) {
    throw new ForbiddenError("You cannot remove yourself as admin");
  }

  return (async () => {
    const profile = await tx.centerAdminProfile.findFirst({ where: { userId, centerId } });
    if (!profile) throw new NotFoundError("Admin not found in this center");

    const adminCount = await tx.centerAdminProfile.count({ where: { centerId } });
    if (adminCount <= 1) {
      throw new BusinessRuleError("Cannot remove the last admin of a center");
    }

    await tx.centerAdminProfile.deleteMany({ where: { userId, centerId } });
    return { removed: true };
  })();
}

export async function inviteCenterAdmin(acting: SessionUser, input: { email: string }) {
  const centerId = centerOf(acting);
  const { email } = input;
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  const { value, effects } = await scopedDb(acting, (tx) =>
    inviteCenterAdminTx(tx, acting, input),
  );
  await runEffects(effects);
  return value;
}

export async function inviteCenterAdminTx(
  tx: TenantTx,
  acting: SessionUser,
  input: { email: string },
): Promise<WithEffects<{ invited: true; existingUser: boolean; token: string }>> {
  const centerId = centerOf(acting);
  const { email } = input;
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  const { existingUserId } = await (async () => {
    const existing = await tx.user.findFirst({ where: { email, status: { not: "deleted" } } });

    if (existing) {
      if (existing.status !== "shell") {
        const alreadyAdmin = await tx.centerAdminProfile.findFirst({
          where: { userId: existing.id, centerId },
        });
        if (alreadyAdmin) throw new ConflictError("User is already an admin of this center");
      }
      await tx.inviteToken.create({
        data: { email, tokenHash, purpose: "admin_invite", centerId, expiresAt },
      });
      return { existingUserId: existing.id };
    }

    await tx.user.create({
      data: {
        email,
        role: "center_admin",
        name: email.split("@")[0] as string,
        status: "shell",
        passwordHash: null,
      },
    });

    await tx.inviteToken.create({
      data: { email, tokenHash, purpose: "admin_invite", centerId, expiresAt },
    });

    return { existingUserId: null };
  })();

  const deliver = existingUserId
    ? () =>
        notify(
          {
            recipients: [existingUserId],
            type: "shell_activation_invite",
            title: "Center admin invite",
            body: "You have been invited to become an admin of a center.",
            data: { centerId },
          },
          {
            to: email,
            subject: "You have been invited to join as a center admin",
            text: `Use this token to accept: ${token}`,
          },
        )
    : () =>
        sendMail({
          to: email,
          subject: "You have been invited to join as a center admin",
          text: `Use this token to activate your account: ${token}`,
        })
          .then(() => undefined)
          .catch(() => undefined);

  return {
    value: { invited: true as const, existingUser: !!existingUserId, token },
    effects: [deliver],
  };
}
