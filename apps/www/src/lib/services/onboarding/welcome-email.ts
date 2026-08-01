// =============================================================================
// Student welcome/onboarding email — exactly-once, non-blocking, signed link.
//
// Fired AFTER a successful self-registration commit (never inside the tx, so a
// mail-provider outage can never fail sign-up). Exactly-once is enforced by an
// ATOMIC claim on student_profiles.onboarding_email_sent_at — whichever
// concurrent call flips NULL→now() owns the send; everyone else no-ops.
//
// The "complete your profile" link carries a SIGNED, EXPIRING JWT (jose,
// NEXTAUTH_SECRET, same 7-day TTL knob as invites). It deliberately does NOT
// log anyone in: the invite-claim door stays password-less-accounts-only
// (its gate 3), and a mailbox leak must never become account access for a
// credentialed student. The token authenticates the LINK (deep-link + resend
// state), the session authenticates the PERSON — /onboarding matches the two.
// =============================================================================
import { prisma } from "@repo/database";
import { SignJWT, jwtVerify } from "jose";
import { deliverInviteEmail } from "@/lib/services/invites/deliver";
import { appBaseUrl, inviteTtlMs } from "@/lib/services/invites/invite-token";

const TOKEN_PURPOSE = "student_onboarding";

function secretKey(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign onboarding links");
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

/** XXXX-XXXX-XXXX — the same code, just readable over a phone call. */
export function groupFamilyCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

function emailContent(input: {
  locale: "ar" | "en";
  name: string;
  familyCode: string;
  link: string;
}): { subject: string; html: string; text: string } {
  const code = groupFamilyCode(input.familyCode);
  const btn =
    `background:#4f46e5;color:#ffffff;padding:12px 22px;border-radius:8px;` +
    `text-decoration:none;font-weight:700;display:inline-block`;
  const codeBox =
    `font-family:ui-monospace,Menlo,monospace;font-size:20px;letter-spacing:2px;` +
    `background:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:10px 16px;` +
    `display:inline-block;direction:ltr`;
  if (input.locale === "en") {
    return {
      subject: "Welcome to Edura — complete your profile",
      text:
        `Welcome, ${input.name}!\n\nComplete your profile: ${input.link}\n\n` +
        `Your Student ID: ${code}\nShare this ID with your parent so they can follow your progress.\n` +
        `The link expires in 7 days.`,
      html: `
<div dir="ltr" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
  <h2 style="margin:24px 0 8px">Welcome, ${input.name} 👋</h2>
  <p style="margin:0 0 16px;color:#3f3f46">Edura connects you with your teachers and centers — schedule, attendance, grades and payments in one place.</p>
  <p style="margin:24px 0"><a href="${input.link}" style="${btn}">Complete your profile</a></p>
  <p style="margin:24px 0 6px;font-weight:700">Your Student ID</p>
  <p style="margin:0 0 6px"><span style="${codeBox}">${code}</span></p>
  <p style="margin:0;color:#52525b;font-size:13px">Share this ID with your parent so they can follow your progress.</p>
  <p style="margin:28px 0 0;color:#a1a1aa;font-size:12px">The button link expires in 7 days — you can request a new one from your onboarding page.</p>
</div>`,
    };
  }
  return {
    subject: "أهلاً بك في إدورا — أكمل ملفك الشخصي",
    text:
      `أهلاً ${input.name}!\n\nأكمل ملفك الشخصي: ${input.link}\n\n` +
      `رمز الطالب الخاص بك: ${code}\nشارك هذا الرمز مع ولي أمرك ليتابع تقدمك الدراسي.\n` +
      `صلاحية الرابط ٧ أيام.`,
    html: `
<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
  <h2 style="margin:24px 0 8px">أهلاً ${input.name} 👋</h2>
  <p style="margin:0 0 16px;color:#3f3f46">إدورا تربطك بمعلميك ومراكزك — الجدول والحضور والدرجات والمدفوعات في مكان واحد.</p>
  <p style="margin:24px 0"><a href="${input.link}" style="${btn}">أكمل ملفك الشخصي</a></p>
  <p style="margin:24px 0 6px;font-weight:700">رمز الطالب الخاص بك</p>
  <p style="margin:0 0 6px"><span style="${codeBox}">${code}</span></p>
  <p style="margin:0;color:#52525b;font-size:13px">شارك هذا الرمز مع ولي أمرك ليتابع تقدمك الدراسي.</p>
  <p style="margin:28px 0 0;color:#a1a1aa;font-size:12px">صلاحية زر الرابط ٧ أيام — يمكنك طلب رابط جديد من صفحة إكمال الملف.</p>
</div>`,
  };
}

/**
 * NEVER THROWS (mirrors deliverInviteEmail's contract) — callers fire-and-forget.
 * `force` is the resend path: it skips the exactly-once stamp but NOT the
 * eligibility guards, and its callers are rate-limited.
 */
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
      // Atomic exactly-once claim: only the call that flips NULL sends.
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
    const { subject, html, text } = emailContent({
      locale,
      name: user.name ?? "",
      familyCode: profile.familyLinkCode,
      link,
    });

    const res = await deliverInviteEmail({ to: user.email, subject, html, text });
    if (res.status !== "sent") {
      console.error(`[welcome-email] send failed for ${userId}: ${res.error ?? "unknown"}`);
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[welcome-email] unexpected failure for ${userId}:`, err);
    return { sent: false, reason: "error" };
  }
}
