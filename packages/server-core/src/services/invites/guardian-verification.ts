// =============================================================================
// GUARDIAN EMAIL VERIFICATION — proving the address reaches a real guardian.
//
// THE HOLE THIS CLOSES. `guardian_email` was stored, never proven. A student
// could type a friend's address, and on this platform that address is what the
// child-safety gate treats as adult oversight. Verification makes the claim
// checkable: the address itself has to receive a link and someone has to click
// it.
//
// THIS TOKEN MINTS NO SESSION, AND THAT IS THE WHOLE SECURITY ARGUMENT. The
// invite machinery next door turns a token into a LOGIN — `CLAIMABLE` maps a
// purpose to the exactly-one role it may resolve into. A guardian is not a user
// of this platform. If verification rode that path, anyone holding a child's
// guardian address would receive a session. So `guardian_email_verification` is
// deliberately absent from CLAIMABLE, and `confirmGuardianEmail` below can do
// exactly one thing: stamp two columns. It returns no user, no token, no cookie.
//
// THE STAMP IS BOUND TO THE ADDRESS IT PROVED. `guardian_email_verified_value`
// records WHICH address was confirmed. Every reader compares it with the
// current `guardian_email`, so editing the address silently un-verifies it —
// otherwise a proof earned by one inbox would be inherited by the next.
//
// THE MESSAGING GATE IS UNCHANGED. `chat-guardian.ts` still opens on a guardian
// email being PRESENT. Requiring verification is a separate, deliberate flip
// (approved to stay unflipped, 2026-08-09): doing it now would lock adult-facing
// messaging for every minor whose guardian has not yet clicked a link they were
// never sent. `guardianVerificationStats` exists to tell you when that flip is
// safe.
// =============================================================================

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, NotFoundError } from "../../errors/classes";
import { appBaseUrl, inviteTtlMs } from "./invite-token";

/** Same shape as the invite kernel's: opaque out, only the hash persists. */
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

/**
 * Is this profile's guardian address proven, right now?
 *
 * The comparison — not the timestamp alone — is the check. Case-folded because
 * the setter lower-cases what it stores and a reader must not disagree with it
 * over capitalisation.
 */
export function isGuardianEmailVerified(profile: {
  guardianEmail?: string | null;
  guardianEmailVerifiedAt?: Date | null;
  guardianEmailVerifiedValue?: string | null;
}): boolean {
  if (!profile.guardianEmail || !profile.guardianEmailVerifiedAt) return false;
  const proven = profile.guardianEmailVerifiedValue?.trim().toLowerCase();
  return !!proven && proven === profile.guardianEmail.trim().toLowerCase();
}

/**
 * Mint a verification link for a student's guardian address.
 *
 * Issuing invalidates any earlier unused token for the same student, so a
 * resend cannot leave two live links for two different addresses.
 */
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
          // The address the link is being sent TO is recorded on the token, so
          // a token cannot later confirm an address it was never mailed to.
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
  /** Masked for the confirmation page — never the full address. */
  emailHint: string;
};

/**
 * Confirm a guardian address from a clicked link.
 *
 * UNAUTHENTICATED BY NECESSITY and harmless by construction: the caller is a
 * guardian with no account, and success grants nothing beyond the stamp. Every
 * failure mode returns the SAME message — an attacker probing tokens must not
 * learn whether one existed, expired or was already used.
 */
export async function confirmGuardianEmail(rawToken: string): Promise<GuardianConfirmResult> {
  const token = rawToken?.trim();
  if (!token) throw new BusinessRuleError("This link is not valid or has expired");
  const hash = hashToken(token);

  return platformDb(async (tx) => {
    const row = await tx.inviteToken.findFirst({
      where: { purpose: GUARDIAN_VERIFICATION_PURPOSE, tokenHash: hash },
      select: { id: true, userId: true, email: true, expiresAt: true, usedAt: true, tokenHash: true },
    });

    // Constant-time compare on the hash we already matched by: the lookup is an
    // indexed equality, this closes the remaining comparison.
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

    // The address moved on since the link was sent. The click proves the OLD
    // inbox, which says nothing about the new one — refuse rather than stamp a
    // value nobody confirmed.
    const mailedTo = row.email?.trim().toLowerCase() ?? null;
    const current = profile.guardianEmail?.trim().toLowerCase() ?? null;
    if (!mailedTo || !current || mailedTo !== current) {
      throw new BusinessRuleError("This link is not valid or has expired");
    }

    const now = new Date();
    // Single-use: burn the token in the SAME transaction as the stamp, so a
    // double click cannot produce two confirmations.
    await tx.inviteToken.update({ where: { id: row.id }, data: { usedAt: now } });
    await tx.studentProfile.update({
      where: { id: profile.id },
      data: { guardianEmailVerifiedAt: now, guardianEmailVerifiedValue: profile.guardianEmail },
    });
    await tx.auditLog.create({
      data: {
        // No actorId: a guardian is not a user. The record is that THIS address
        // was proven at THIS time, which is the fact worth keeping.
        action: "student.guardian_email_verified",
        targetType: "student_profile",
        targetId: profile.id,
        afterState: { guardianEmail: profile.guardianEmail, verifiedAt: now.toISOString() },
      },
    });

    return { verified: true as const, emailHint: maskEmail(profile.guardianEmail!) };
  });
}

/** `a***@example.com` — enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const head = user.slice(0, 1);
  return `${head}${"*".repeat(Math.max(user.length - 1, 1))}@${domain}`;
}

/**
 * How many minors would be locked out if the messaging gate started requiring
 * verification. The number to watch before flipping it.
 */
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
