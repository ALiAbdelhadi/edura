import bcrypt from "bcryptjs";
import type { Role } from "@repo/database";
import { platformDb, type TenantTx } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ExpiredError,
  NotFoundError,
} from "@/lib/errors/classes";
import { generateFamilyCode, hashToken } from "@/lib/utils/random";

export async function acceptInvite(token: string, password: string): Promise<{ userId: string }> {
  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(password, 10);

  return platformDb(async (tx) => {
    const row = await tx.inviteToken.findUnique({ where: { tokenHash } });
    if (!row) throw new ExpiredError("Invalid or expired invite token");
    if (row.usedAt) throw new ExpiredError("Invite token already used");
    if (row.expiresAt.getTime() < Date.now()) throw new ExpiredError("Invite token expired");

    const user = await tx.user.findFirst({ where: { email: row.email } });
    if (!user) throw new NotFoundError("Invited user not found");
    if (user.status === "deleted" || user.status === "suspended") {
      throw new BusinessRuleError("Cannot activate a deleted or suspended account");
    }

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, status: "active", emailVerified: true },
    });

    await ensureRoleProfile(tx, user.id, user.role, user.name, row.centerId ?? undefined);

    await tx.inviteToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });

    return { userId: user.id };
  });
}

async function ensureRoleProfile(
  tx: TenantTx,
  userId: string,
  role: Role,
  name: string,
  centerId?: string,
) {
  if (role === "student") {
    await tx.studentProfile.upsert({
      where: { userId },
      create: { userId, fullName: name, familyLinkCode: generateFamilyCode() },
      update: {},
    });
  } else if (role === "parent") {
    await tx.parentProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  } else if (role === "teacher") {
    await tx.teacherProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  } else if (role === "center_admin") {
    if (!centerId) {
      throw new BusinessRuleError("Admin invite has no associated center");
    }
    await tx.centerAdminProfile.upsert({
      where: { userId },
      create: { userId, centerId },
      update: {},
    });
  }
}
