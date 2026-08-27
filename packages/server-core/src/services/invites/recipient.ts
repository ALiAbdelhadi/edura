import type { TenantTx } from "../../db/scope";
import { isMinorFromProfile } from "@repo/database/chat-minors";

export type InviteRecipient =
  | { kind: "parent_account"; email: string }
  | { kind: "guardian_email"; email: string }
  | { kind: "student_adult"; email: string }
  | { kind: "none"; reason: "minor_without_guardian_email" };

export async function resolveStudentInviteRecipient(
  tx: TenantTx,
  studentUserId: string,
  now: Date = new Date(),
): Promise<InviteRecipient> {
  const profile = await tx.studentProfile.findFirst({
    where: { userId: studentUserId },
    select: {
      guardianEmail: true,
      dateOfBirth: true,
      dateOfBirthVerifiedAt: true,
    },
  });

  const links = await tx.parentStudentLink.findMany({
    where: { studentId: studentUserId, status: "approved" },
    select: { parentId: true },
  });
  if (links.length) {
    const parent = await tx.user.findFirst({
      where: {
        id: { in: links.map((l) => l.parentId) },
        deletedAt: null,
        email: { not: null },
      },
      select: { email: true },
    });
    if (parent?.email) return { kind: "parent_account", email: parent.email };
  }

  if (profile?.guardianEmail) {
    return { kind: "guardian_email", email: profile.guardianEmail };
  }

  if (!isMinorFromProfile(profile, now)) {
    const student = await tx.user.findUnique({
      where: { id: studentUserId },
      select: { email: true },
    });
    if (student?.email) return { kind: "student_adult", email: student.email };
  }

  return { kind: "none", reason: "minor_without_guardian_email" };
}

export function guardianContactDueAt(from: Date = new Date()): Date {
  const days = Number(process.env.GUARDIAN_EMAIL_GRACE_DAYS) || 14;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
