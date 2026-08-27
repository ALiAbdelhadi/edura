import { prisma } from "@repo/database";
import { groupFamilyCode, send } from "@repo/notifications";
import { SignJWT, jwtVerify } from "jose";
import { appBaseUrl, inviteTtlMs } from "@/lib/services/invites/invite-token";
import { authSecret } from "@repo/server-core/auth/auth-env";

export { groupFamilyCode };

const TOKEN_PURPOSE = "student_onboarding";

function secretKey(): Uint8Array {
  const secret = authSecret();
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to sign onboarding links");
  return new TextEncoder().encode(secret);
}

export async function signOnboardingToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: TOKEN_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + inviteTtlMs()))
    .sign(secretKey());
}

export type OnboardingTokenCheck =
  | { status: "valid"; userId: string }
  | { status: "expired" }
  | { status: "invalid" };

export async function verifyOnboardingToken(token: string): Promise<OnboardingTokenCheck> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== TOKEN_PURPOSE || !payload.sub) return { status: "invalid" };
    return { status: "valid", userId: payload.sub };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "ERR_JWT_EXPIRED") return { status: "expired" };
    return { status: "invalid" };
  }
}

export async function sendStudentWelcomeEmail(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, locale: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.role !== "student" || !user.email) {
      return { sent: false, reason: "ineligible" };
    }

    if (!opts.force) {
      const claimed = await prisma.studentProfile.updateMany({
        where: { userId, onboardingEmailSentAt: null },
        data: { onboardingEmailSentAt: new Date() },
      });
      if (claimed.count !== 1) return { sent: false, reason: "already_sent" };
    } else {
      await prisma.studentProfile.updateMany({
        where: { userId },
        data: { onboardingEmailSentAt: new Date() },
      });
    }

    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      select: { familyLinkCode: true },
    });
    if (!profile) return { sent: false, reason: "no_profile" };

    const locale: "ar" | "en" = user.locale === "en" ? "en" : "ar";
    const token = await signOnboardingToken(userId);
    const link = `${appBaseUrl()}/${locale}/onboarding?token=${token}`;
    const res = await send(
      "welcome",
      { email: user.email, locale, userId: user.id },
      {
        name: user.name ?? "",
        link,
        studentCode: profile.familyLinkCode,
        expiryDays: Math.max(1, Math.round(inviteTtlMs() / (24 * 60 * 60 * 1000))),
      },
    );
    if (!res.delivered) {
      const why = res.results.map((r) => `${r.channel}=${r.error ?? r.status}`).join(", ");
      console.error(`[welcome-email] send failed for ${userId}: ${why}`);
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[welcome-email] unexpected failure for ${userId}:`, err);
    return { sent: false, reason: "error" };
  }
}
