import type { SessionUser } from "../../auth/types";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, NotFoundError } from "../../errors/classes";
import { guardianChannelState } from "@repo/database/chat-guardian";
import { notify } from "../../services/notifications/notify";
import { guardianContactDueAt } from "./recipient";

export type GuardianContactStatus = {
  required: boolean;
  guardianEmail: string | null;
  guardianPhone: string | null;
  messagingLocked: boolean;
  dueAt: Date | null;
  overdue: boolean;
  dismissable: boolean;
};

export async function getGuardianContactStatus(
  studentUserId: string,
  now: Date = new Date(),
): Promise<GuardianContactStatus> {
  const state = await platformDb((tx) => guardianChannelState(tx, studentUserId, now));
  return {
    required: state.isMinor && !state.hasGuardianChannel,
    guardianEmail: state.guardianEmail,
    guardianPhone: state.guardianPhone,
    messagingLocked: state.locked,
    dueAt: state.dueAt,
    overdue: state.overdue,
    dismissable: !state.overdue,
  };
}

export async function setGuardianContact(
  actor: SessionUser,
  studentUserId: string,
  input: { guardianEmail?: string | null; guardianPhone?: string | null },
): Promise<GuardianContactStatus> {
  const guardianEmail = input.guardianEmail?.trim().toLowerCase() || null;
  const guardianPhone = input.guardianPhone?.trim() || null;

  if (!guardianEmail && !guardianPhone) {
    throw new BusinessRuleError("Provide a guardian email or phone number");
  }

  const { selfSupplied, centerIds } = await platformDb(
    async (tx) => {
      const student = await tx.user.findUnique({
        where: { id: studentUserId },
        select: { id: true, email: true, phone: true, role: true, deletedAt: true },
      });
      if (!student || student.role !== "student" || student.deletedAt) {
        throw new NotFoundError("Student not found");
      }

      if (guardianEmail && student.email && guardianEmail === student.email.toLowerCase()) {
        throw new BusinessRuleError(
          "The guardian email must be different from the student's own login email",
        );
      }

      const profile = await tx.studentProfile.findFirst({
        where: { userId: studentUserId },
        select: { id: true, guardianEmail: true, guardianContactDueAt: true },
      });
      if (!profile) throw new NotFoundError("Student profile not found");

      await tx.studentProfile.update({
        where: { id: profile.id },
        data: {
          ...(guardianEmail
            ? {
                guardianEmail,
                guardianEmailAddedAt: new Date(),
                guardianEmailAddedBy: actor.id,
                guardianEmailVerifiedAt: null,
                guardianEmailVerifiedValue: null,
              }
            : {}),
          ...(guardianPhone ? { guardianPhone } : {}),
          ...(guardianEmail || profile.guardianEmail || profile.guardianContactDueAt
            ? {}
            : { guardianContactDueAt: guardianContactDueAt() }),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: guardianEmail ? "student.guardian_email_set" : "student.guardian_phone_set",
          targetType: "student_profile",
          targetId: profile.id,
          beforeState: { guardianEmail: profile.guardianEmail },
          afterState: { guardianEmail: guardianEmail ?? profile.guardianEmail },
        },
      });

      const rosters = await tx.centerStudentRoster.findMany({
        where: { studentId: studentUserId },
        select: { centerId: true },
      });

      return {
        selfSupplied: actor.id === studentUserId,
        centerIds: [...new Set(rosters.map((r) => r.centerId))],
      };
    },
    { actorId: actor.id },
  );

  if (selfSupplied && guardianEmail && centerIds.length) {
    await notifyCenters(
      centerIds,
      "Guardian email added by the student",
      "A student added their own guardian email. Please confirm it with the family.",
      { studentId: studentUserId },
    );
  }

  return getGuardianContactStatus(studentUserId);
}

async function notifyCenters(
  centerIds: string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  const recipients = await platformDb(async (tx) => {
    const admins = await tx.centerAdminProfile.findMany({
      where: { centerId: { in: centerIds } },
      select: { userId: true },
    });
    const managers = await tx.centerStaff.findMany({
      where: { centerId: { in: centerIds }, removedAt: null, role: "manager" },
      select: { staffUserId: true },
    });
    return [
      ...new Set([
        ...admins.map((a) => a.userId),
        ...managers.map((m) => m.staffUserId),
      ]),
    ];
  });
  if (!recipients.length) return;
  await notify({ recipients, type: "guardian_contact_required", title, body, data });
}

export async function runGuardianContactReminders(now: Date = new Date()) {
  const everyDays = Number(process.env.GUARDIAN_REMINDER_EVERY_DAYS) || 3;
  const windowStart = new Date(now.getTime() - everyDays * 24 * 60 * 60 * 1000);

  const due = await platformDb(async (tx) => {
    const profiles = await tx.studentProfile.findMany({
      where: {
        guardianEmail: null,
        userId: { not: null },
        guardianContactDueAt: { not: null },
      },
      select: {
        userId: true,
        fullName: true,
        guardianContactDueAt: true,
      },
      take: 2000,
    });
    if (!profiles.length) return [];

    const ids = profiles.map((p) => p.userId as string);
    const users = await tx.user.findMany({
      where: { id: { in: ids }, deletedAt: null, status: { in: ["active", "shell"] } },
      select: { id: true },
    });
    const alive = new Set(users.map((u) => u.id));

    const recent = await tx.notification.findMany({
      where: {
        userId: { in: ids },
        type: "guardian_contact_required",
        createdAt: { gte: windowStart },
      },
      select: { userId: true },
    });
    const reminded = new Set(recent.map((r) => r.userId));

    return profiles
      .filter((p) => alive.has(p.userId as string) && !reminded.has(p.userId as string))
      .map((p) => ({
        studentId: p.userId as string,
        fullName: p.fullName,
        overdue: !!p.guardianContactDueAt && p.guardianContactDueAt.getTime() < now.getTime(),
      }));
  });

  let reminded = 0;
  let escalated = 0;

  for (const item of due) {
    const parents = await platformDb((tx) =>
      tx.parentStudentLink.findMany({
        where: { studentId: item.studentId, status: "approved" },
        select: { parentId: true },
      }),
    );

    await notify({
      recipients: [item.studentId, ...parents.map((p) => p.parentId)],
      type: "guardian_contact_required",
      title: "Guardian email required",
      body: item.overdue
        ? "Messaging with teachers and center staff stays locked until a guardian email is added."
        : "Add a guardian email to enable messaging with teachers and center staff.",
      data: { studentId: item.studentId, overdue: item.overdue },
    });
    reminded++;

    if (item.overdue) {
      const centerIds = await platformDb(async (tx) => {
        const rosters = await tx.centerStudentRoster.findMany({
          where: { studentId: item.studentId },
          select: { centerId: true },
        });
        return [...new Set(rosters.map((r) => r.centerId))];
      });
      if (centerIds.length) {
        await notifyCenters(
          centerIds,
          "Student still needs a guardian email",
          `${item.fullName} has passed the deadline for adding a guardian email. Messaging with adults stays locked until it is added.`,
          { studentId: item.studentId },
        );
        escalated++;
      }
    }
  }

  return { scanned: due.length, reminded, escalated };
}
