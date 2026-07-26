// =============================================================================
// WHERE does a student's claim link go?
//
// Almost every student on this platform is a MINOR (isMinor() is default-minor:
// adult requires a DOB *and* a verification stamp *and* age >= 18, and a
// walk-in has none of those). So "email the student" is the wrong default —
// it opens an unmonitored adult channel to a child. The invite goes to the
// GUARDIAN, and if there is no guardian email it goes nowhere: the counter
// hands the link over in person instead.
// =============================================================================

import type { TenantTx } from "../../db/scope";
import { isMinorFromProfile } from "@repo/database/chat-minors";

export type InviteRecipient =
  | { kind: "parent_account"; email: string }
  | { kind: "guardian_email"; email: string }
  | { kind: "student_adult"; email: string }
  | { kind: "none"; reason: "minor_without_guardian_email" };

/**
 * Resolution order, strictest-trust first:
 *   1. an APPROVED parent link whose parent account has an email;
 *   2. student_profiles.guardian_email, captured at the counter;
 *   3. the student's own email — ONLY for a verified adult student;
 *   4. nothing.
 *
 * Case 4 is not a failure to paper over. We deliberately do NOT fall back to
 * the minor's own email or phone: that is exactly the unmonitored channel the
 * rule exists to prevent. Registration still succeeds; the caller surfaces the
 * copyable link for physical handover and flags that a guardian email is owed.
 */
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

/**
 * Grace period for supplying a guardian email. Passing it NEVER suspends the
 * account (the student paid) and NEVER unlocks messaging — it only escalates
 * the reminder from periodic to persistent and pulls the center in.
 */
export function guardianContactDueAt(from: Date = new Date()): Date {
  const days = Number(process.env.GUARDIAN_EMAIL_GRACE_DAYS) || 14;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
