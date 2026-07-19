import { platformDb } from "@/lib/db/scope";
import { BusinessRuleError, NotFoundError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { generateOpaqueToken, hashToken } from "@/lib/utils/random";
import { createTempStudent } from "@/lib/services/temp-students/temp-students";
import { normalizeEgyptPhone } from "@/lib/services/whatsapp/phone";
import { sendWhatsApp } from "@/lib/services/whatsapp/send";

const TOKEN_TTL_MS = () =>
  (Number(process.env.WALKIN_TOKEN_TTL_HOURS) || 168) * 60 * 60 * 1000;

function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3002").replace(/\/$/, "");
}

/**
 * Issue a fresh walk_in_onboarding token for a shell student, invalidating any
 * outstanding unused ones so exactly one live link exists per student.
 * Returns the OPAQUE token (only ever leaves the server inside the WhatsApp
 * message); the DB stores its hash.
 */
async function issueWalkInToken(userId: string, centerId: string | null, actorId: string) {
  const token = generateOpaqueToken();
  await platformDb(
    async (tx) => {
      await tx.inviteToken.updateMany({
        where: { userId, purpose: "walk_in_onboarding", usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.inviteToken.create({
        data: {
          userId,
          centerId,
          purpose: "walk_in_onboarding",
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS()),
        },
      });
    },
    { actorId },
  );
  return token;
}

function claimLink(token: string, locale: "ar" | "en") {
  return `${appBaseUrl()}/${locale}/claim?token=${token}`;
}

export type WalkInResult = {
  existing: boolean;
  studentId: string;
  studentCode: string | null;
  fullName: string | null;
  whatsapp: { status: "sent" | "failed"; error?: string };
};

/**
 * Walk-in registration (Step 7). Creates (or links to) the student account and
 * delivers the studentCode over WhatsApp:
 *  - no account with this phone      -> shell student (Step 6 machinery) +
 *    one-time tokenized onboarding link (walk_in_welcome template)
 *  - active account with this phone  -> NO duplicate; roster link + studentCode
 *    reminder (student_code_reminder template)
 */
export async function registerWalkIn(
  input: { fullName: string; phone: string; grade?: string; locale?: "ar" | "en" },
  creator: SessionUser,
): Promise<WalkInResult> {
  const phone = normalizeEgyptPhone(input.phone);
  const locale = input.locale ?? "ar";

  // Duplicate-by-phone: an ACTIVE (non-shell) user already owns this number.
  const existing = await platformDb(async (tx) => {
    const user = await tx.user.findFirst({
      where: { phone, status: { notIn: ["deleted", "shell"] } },
      select: { id: true, role: true, name: true, status: true },
    });
    if (!user) return null;
    if (user.role !== "student") {
      throw new BusinessRuleError("This phone belongs to a non-student account");
    }
    const profile = await tx.studentProfile.findFirst({
      where: { userId: user.id },
      select: { studentCode: true, fullName: true },
    });
    if (creator.role === "center_admin" && creator.centerId) {
      await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId: creator.centerId, studentId: user.id } },
        create: { centerId: creator.centerId, studentId: user.id, addedAt: new Date() },
        update: {},
      });
    }
    return { user, profile };
  }, { actorId: creator.id });

  if (existing) {
    const name = existing.profile?.fullName ?? existing.user.name ?? "";
    const wa = await sendWhatsApp({
      to: phone,
      template: "student_code_reminder",
      params: [name, existing.profile?.studentCode ?? "—"],
      locale,
      userId: existing.user.id,
      centerId: creator.centerId ?? undefined,
      createdBy: creator.id,
    });
    return {
      existing: true,
      studentId: existing.user.id,
      studentCode: existing.profile?.studentCode ?? null,
      fullName: name,
      whatsapp: { status: wa.status, error: wa.error },
    };
  }

  // New (or still-shell) walk-in — Step 6 shell machinery, unchanged.
  const shell = await createTempStudent(
    { fullName: input.fullName, phone, grade: input.grade },
    creator,
  );

  const token = await issueWalkInToken(shell.id, creator.centerId ?? null, creator.id);
  const wa = await sendWhatsApp({
    to: phone,
    template: "walk_in_welcome",
    params: [shell.fullName ?? "", shell.studentCode ?? "", claimLink(token, locale)],
    locale,
    userId: shell.id,
    centerId: creator.centerId ?? undefined,
    createdBy: creator.id,
  });

  return {
    existing: false,
    studentId: shell.id,
    studentCode: shell.studentCode ?? null,
    fullName: shell.fullName,
    whatsapp: { status: wa.status, error: wa.error },
  };
}

/** Re-send the WhatsApp message for a walk-in student (fresh token if still claimable). */
export async function resendWalkIn(
  studentId: string,
  creator: SessionUser,
  locale: "ar" | "en" = "ar",
): Promise<WalkInResult> {
  const found = await platformDb(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true, name: true, status: true, phone: true, passwordHash: true },
    });
    if (!user || user.role !== "student" || user.status === "deleted") {
      throw new NotFoundError("Student not found");
    }
    if (!user.phone) throw new BusinessRuleError("Student has no phone number");
    const profile = await tx.studentProfile.findFirst({
      where: { userId: user.id },
      select: { studentCode: true, fullName: true },
    });
    return { user, profile };
  }, { actorId: creator.id });

  const phone = normalizeEgyptPhone(found.user.phone!);
  const name = found.profile?.fullName ?? found.user.name ?? "";
  const code = found.profile?.studentCode ?? "—";

  // Already credentialed -> only the code reminder; never a login link.
  const claimable = found.user.passwordHash === null;
  const wa = claimable
    ? await (async () => {
        const token = await issueWalkInToken(found.user.id, creator.centerId ?? null, creator.id);
        return sendWhatsApp({
          to: phone,
          template: "walk_in_welcome",
          params: [name, code, claimLink(token, locale)],
          locale,
          userId: found.user.id,
          centerId: creator.centerId ?? undefined,
          createdBy: creator.id,
        });
      })()
    : await sendWhatsApp({
        to: phone,
        template: "student_code_reminder",
        params: [name, code],
        locale,
        userId: found.user.id,
        centerId: creator.centerId ?? undefined,
        createdBy: creator.id,
      });

  return {
    existing: !claimable,
    studentId: found.user.id,
    studentCode: found.profile?.studentCode ?? null,
    fullName: name,
    whatsapp: { status: wa.status, error: wa.error },
  };
}
