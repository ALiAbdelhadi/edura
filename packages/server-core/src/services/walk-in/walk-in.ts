import { platformDb } from "../../db/scope";
import { BusinessRuleError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { createTempStudent } from "../../services/temp-students/temp-students";
import { normalizeEgyptPhone } from "../../services/whatsapp/phone";
import { studentClaimEmail } from "../../mail/templates";
import {
  claimLink,
  issueInvite,
  redactToken,
} from "../../services/invites/invite-token";
import {
  deliverInviteEmail,
  deliverInviteWhatsApp,
  inviteExpiryDays,
  type DeliveryResult,
} from "../../services/invites/deliver";
import {
  guardianContactDueAt,
  resolveStudentInviteRecipient,
  type InviteRecipient,
} from "../../services/invites/recipient";

export type WalkInInvite = {
  email: DeliveryResult;
  whatsapp: DeliveryResult;
  recipient: InviteRecipient["kind"];
  reason?: string;
  claimLink?: string;
  guardianEmailRequired: boolean;
  guardianContactDueAt?: Date;
};

export type WalkInResult = {
  existing: boolean;
  studentId: string;
  studentCode: string | null;
  fullName: string | null;
  invite: WalkInInvite;
  whatsapp: DeliveryResult;
};

async function sendStudentClaim(
  student: { id: string; fullName: string | null; studentCode: string | null },
  creator: SessionUser,
  locale: "ar" | "en",
  phone: string | null,
): Promise<WalkInInvite> {
  const { recipient, centerName, dueAt } = await platformDb(
    async (tx) => {
      const recipient = await resolveStudentInviteRecipient(tx, student.id);
      const center = creator.centerId
        ? await tx.center.findUnique({
            where: { id: creator.centerId },
            select: { name: true },
          })
        : null;

      let dueAt: Date | null = null;
      if (recipient.kind === "none") {
        const profile = await tx.studentProfile.findFirst({
          where: { userId: student.id },
          select: { id: true, guardianContactDueAt: true },
        });
        if (profile) {
          dueAt = profile.guardianContactDueAt ?? guardianContactDueAt();
          if (!profile.guardianContactDueAt) {
            await tx.studentProfile.update({
              where: { id: profile.id },
              data: { guardianContactDueAt: dueAt },
            });
          }
        }
      }
      return { recipient, centerName: center?.name ?? null, dueAt };
    },
    { actorId: creator.id },
  );

  const { token } = await issueInvite({
    userId: student.id,
    purpose: "walk_in_onboarding",
    centerId: creator.centerId ?? null,
    email: recipient.kind === "none" ? null : recipient.email,
    actorId: creator.id,
  });
  const link = claimLink(token, locale);

  const email: DeliveryResult =
    recipient.kind === "none"
      ? { status: "no_recipient" }
      : await deliverInviteEmail({
          to: recipient.email,
          ...studentClaimEmail({
            locale,
            link,
            studentName: student.fullName ?? "",
            studentCode: student.studentCode ?? "—",
            centerName,
            toGuardian: recipient.kind !== "student_adult",
            expiryDays: inviteExpiryDays(),
          }),
        });

  const whatsapp = await deliverInviteWhatsApp({
    to: phone,
    template: "walk_in_welcome",
    params: [student.fullName ?? "", student.studentCode ?? "", link],
    locale,
    userId: student.id,
    centerId: creator.centerId ?? undefined,
    createdBy: creator.id,
  });

  return {
    email,
    whatsapp,
    recipient: recipient.kind,
    ...(recipient.kind === "none" ? { reason: recipient.reason } : {}),
    claimLink: link,
    guardianEmailRequired: recipient.kind === "none",
    ...(dueAt ? { guardianContactDueAt: dueAt } : {}),
  };
}

export async function registerWalkIn(
  input: {
    fullName: string;
    phone: string;
    grade?: string;
    locale?: "ar" | "en";
    guardianEmail?: string;
    guardianPhone?: string;
  },
  creator: SessionUser,
): Promise<WalkInResult> {
  const phone = normalizeEgyptPhone(input.phone);
  const locale = input.locale ?? "ar";
  const guardianEmail = input.guardianEmail?.trim().toLowerCase() || null;
  const guardianPhone = input.guardianPhone
    ? normalizeEgyptPhone(input.guardianPhone)
    : null;

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
    const whatsapp = await deliverInviteWhatsApp({
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
      invite: {
        email: { status: "skipped" },
        whatsapp,
        recipient: "none",
        guardianEmailRequired: false,
      },
      whatsapp,
    };
  }

  const shell = await createTempStudent(
    { fullName: input.fullName, phone, grade: input.grade },
    creator,
  );

  if (guardianEmail || guardianPhone) {
    await setGuardianContactRow(shell.id, { guardianEmail, guardianPhone }, creator.id);
  }

  const invite = await sendStudentClaim(
    { id: shell.id, fullName: shell.fullName, studentCode: shell.studentCode },
    creator,
    locale,
    phone,
  );

  return {
    existing: false,
    studentId: shell.id,
    studentCode: shell.studentCode ?? null,
    fullName: shell.fullName,
    invite,
    whatsapp: invite.whatsapp,
  };
}

async function setGuardianContactRow(
  studentUserId: string,
  data: { guardianEmail: string | null; guardianPhone: string | null },
  actorId: string,
) {
  await platformDb(
    async (tx) => {
      const profile = await tx.studentProfile.findFirst({
        where: { userId: studentUserId },
        select: { id: true },
      });
      if (!profile) return;
      await tx.studentProfile.update({
        where: { id: profile.id },
        data: {
          ...(data.guardianEmail
            ? {
                guardianEmail: data.guardianEmail,
                guardianEmailAddedAt: new Date(),
                guardianEmailAddedBy: actorId,
              }
            : {}),
          ...(data.guardianPhone ? { guardianPhone: data.guardianPhone } : {}),
        },
      });
    },
    { actorId },
  );
}

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

  if (found.user.passwordHash !== null) {
    const whatsapp = await deliverInviteWhatsApp({
      to: phone,
      template: "student_code_reminder",
      params: [name, code],
      locale,
      userId: found.user.id,
      centerId: creator.centerId ?? undefined,
      createdBy: creator.id,
    });
    return {
      existing: true,
      studentId: found.user.id,
      studentCode: found.profile?.studentCode ?? null,
      fullName: name,
      invite: {
        email: { status: "skipped" },
        whatsapp,
        recipient: "none",
        guardianEmailRequired: false,
      },
      whatsapp,
    };
  }

  const invite = await sendStudentClaim(
    { id: found.user.id, fullName: name, studentCode: found.profile?.studentCode ?? null },
    creator,
    locale,
    phone,
  );

  return {
    existing: false,
    studentId: found.user.id,
    studentCode: found.profile?.studentCode ?? null,
    fullName: name,
    invite,
    whatsapp: invite.whatsapp,
  };
}

export { redactToken };
