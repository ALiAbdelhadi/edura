import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, NotFoundError } from "../../errors/classes";
import { appBaseUrl, inviteTtlMs } from "./invite-token";

function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const GUARDIAN_VERIFICATION_PURPOSE = "guardian_email_verification" as const;

export function guardianVerifyLink(token: string, locale: "ar" | "en" = "ar"): string {
  return `${appBaseUrl()}/${locale}/guardian/verify?token=${encodeURIComponent(token)}`;
}

export function isGuardianEmailVerified(profile: {
  guardianEmail?: string | null;
  guardianEmailVerifiedAt?: Date | null;
  guardianEmailVerifiedValue?: string | null;
}): boolean {
  if (!profile.guardianEmail || !profile.guardianEmailVerifiedAt) return false;
  const proven = profile.guardianEmailVerifiedValue?.trim().toLowerCase();
  return !!proven && proven === profile.guardianEmail.trim().toLowerCase();
}

export async function issueGuardianVerification(input: {
  studentUserId: string;
  actorId: string;
}): Promise<{ token: string; expiresAt: Date; email: string }> {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + inviteTtlMs());

  const email = await platformDb(
    async (tx) => {
      const profile = await tx.studentProfile.findFirst({
        where: { userId: input.studentUserId },
        select: { id: true, guardianEmail: true },
      });
      if (!profile) throw new NotFoundError("Student profile not found");
      if (!profile.guardianEmail) {
        throw new BusinessRuleError("This student has no guardian email to verify");
      }

      await tx.inviteToken.updateMany({
        where: {
          userId: input.studentUserId,
          purpose: GUARDIAN_VERIFICATION_PURPOSE,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      await tx.inviteToken.create({
        data: {
          userId: input.studentUserId,
          email: profile.guardianEmail,
          purpose: GUARDIAN_VERIFICATION_PURPOSE,
          tokenHash: hashToken(token),
          expiresAt,
        },
      });
      return profile.guardianEmail;
    },
    { actorId: input.actorId },
  );

  return { token, expiresAt, email };
}

export type GuardianConfirmResult = {
  verified: true;
  emailHint: string;
};

export async function confirmGuardianEmail(rawToken: string): Promise<GuardianConfirmResult> {
  const token = rawToken?.trim();
  if (!token) throw new BusinessRuleError("This link is not valid or has expired");
  const hash = hashToken(token);

  return platformDb(async (tx) => {
    const row = await tx.inviteToken.findFirst({
      where: { purpose: GUARDIAN_VERIFICATION_PURPOSE, tokenHash: hash },
      select: { id: true, userId: true, email: true, expiresAt: true, usedAt: true, tokenHash: true },
    });

    const ok =
      row &&
      timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"));
    if (!ok) throw new BusinessRuleError("This link is not valid or has expired");
    if (row.usedAt) throw new BusinessRuleError("This link is not valid or has expired");
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BusinessRuleError("This link is not valid or has expired");
    }

    const profile = await tx.studentProfile.findFirst({
      where: { userId: row.userId },
      select: { id: true, guardianEmail: true },
    });
    if (!profile) throw new BusinessRuleError("This link is not valid or has expired");

    const mailedTo = row.email?.trim().toLowerCase() ?? null;
    const current = profile.guardianEmail?.trim().toLowerCase() ?? null;
    if (!mailedTo || !current || mailedTo !== current) {
      throw new BusinessRuleError("This link is not valid or has expired");
    }

    const now = new Date();
    await tx.inviteToken.update({ where: { id: row.id }, data: { usedAt: now } });
    await tx.studentProfile.update({
      where: { id: profile.id },
      data: { guardianEmailVerifiedAt: now, guardianEmailVerifiedValue: profile.guardianEmail },
    });
    await tx.auditLog.create({
      data: {
        action: "student.guardian_email_verified",
        targetType: "student_profile",
        targetId: profile.id,
        afterState: { guardianEmail: profile.guardianEmail, verifiedAt: now.toISOString() },
      },
    });

    return { verified: true as const, emailHint: maskEmail(profile.guardianEmail!) };
  });
}

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const head = user.slice(0, 1);
  return `${head}${"*".repeat(Math.max(user.length - 1, 1))}@${domain}`;
}

export async function guardianVerificationStats(): Promise<{
  withGuardianEmail: number;
  verified: number;
  unverified: number;
}> {
  return platformDb(async (tx) => {
    const rows = await tx.studentProfile.findMany({
      where: { guardianEmail: { not: null } },
      select: { guardianEmail: true, guardianEmailVerifiedAt: true, guardianEmailVerifiedValue: true },
      take: 100_000,
    });
    const verified = rows.filter((r) => isGuardianEmailVerified(r)).length;
    return {
      withGuardianEmail: rows.length,
      verified,
      unverified: rows.length - verified,
    };
  });
}
