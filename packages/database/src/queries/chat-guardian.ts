// =============================================================================
// Child safety — does this MINOR have a reachable GUARDIAN CHANNEL?
//
// ONE implementation, in the same spirit as isMinor() next door: a single
// POSITIVE condition, so a NULL, a missing row, or a new field can never
// silently unlock a child's account.
//
// THE RULE (approved 2026-07-25)
// -----------------------------------------------------------------------------
// A student has a guardian channel when EITHER:
//   (a) an APPROVED parent link points at a parent account that has an email
//       — the strongest form: a real, linked, approved guardian on-platform; or
//   (b) student_profiles.guardian_email is set — captured at the counter when
//       the guardian has no account.
//
// A guardian PHONE is deliberately NOT enough. We store it (walk-in counters
// very often get a phone and nothing else, and it is what a future SMS/WhatsApp
// channel will use) but it does not satisfy this gate, because email is the
// only guardian channel we can actually deliver on today. Promising oversight
// over a channel that does not exist yet would be worse than locking.
//
// WHAT THE LOCK DOES
// -----------------------------------------------------------------------------
// It closes ADULT-FACING messaging only — teacher, assistant, center_admin,
// center_staff (see ADULT_ROLES). Everything else about the account is
// untouched: the student attends the classes they paid for, reads materials,
// sees grades, tops up a wallet, and — critically — can still message their own
// PARENT. `parent` is not an adult role here, so the gate never cuts a child
// off from their guardian. The account is never suspended by this rule.
// =============================================================================

import type { TenantTx } from "../client";
import { isMinorFromProfile } from "./chat-minors";

export type GuardianChannelState = {
  isMinor: boolean;
  /** True when the gate is satisfied — see THE RULE above. */
  hasGuardianChannel: boolean;
  /** True when adult-facing messaging must stay locked. */
  locked: boolean;
  guardianEmail: string | null;
  guardianPhone: string | null;
  /** Escalation marker only: never suspends, never unlocks. */
  dueAt: Date | null;
  overdue: boolean;
};

const SELECT = {
  userId: true,
  dateOfBirth: true,
  dateOfBirthVerifiedAt: true,
  guardianEmail: true,
  guardianPhone: true,
  guardianContactDueAt: true,
} as const;

type ProfileRow = {
  userId: string | null;
  dateOfBirth: Date | null;
  dateOfBirthVerifiedAt: Date | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  guardianContactDueAt: Date | null;
};

/**
 * Which of these student ids have an APPROVED parent link whose parent account
 * carries an email? Batched — the gate runs on every directory listing.
 */
async function studentsWithApprovedParentEmail(
  db: TenantTx,
  studentUserIds: string[],
): Promise<Set<string>> {
  if (!studentUserIds.length) return new Set();
  const links = await db.parentStudentLink.findMany({
    where: { studentId: { in: studentUserIds }, status: "approved" },
    select: { studentId: true, parentId: true },
  });
  if (!links.length) return new Set();

  const parents = await db.user.findMany({
    where: {
      id: { in: [...new Set(links.map((l) => l.parentId))] },
      deletedAt: null,
      email: { not: null },
    },
    select: { id: true },
  });
  const withEmail = new Set(parents.map((p) => p.id));
  return new Set(
    links.filter((l) => withEmail.has(l.parentId)).map((l) => l.studentId),
  );
}

function decide(
  profile: ProfileRow | null | undefined,
  viaParent: boolean,
  now: Date,
): GuardianChannelState {
  const minor = isMinorFromProfile(profile, now);
  const hasGuardianChannel = viaParent || !!profile?.guardianEmail;
  const dueAt = profile?.guardianContactDueAt ?? null;
  return {
    isMinor: minor,
    hasGuardianChannel,
    // A verified adult student needs no guardian channel at all.
    locked: minor && !hasGuardianChannel,
    guardianEmail: profile?.guardianEmail ?? null,
    guardianPhone: profile?.guardianPhone ?? null,
    dueAt,
    overdue: !!dueAt && dueAt.getTime() < now.getTime(),
  };
}

/** Full state for one student — powers the banner and the API status endpoint. */
export async function guardianChannelState(
  db: TenantTx,
  studentUserId: string,
  now: Date = new Date(),
): Promise<GuardianChannelState> {
  const profile = await db.studentProfile.findFirst({
    where: { userId: studentUserId },
    select: SELECT,
  });
  const viaParent = (
    await studentsWithApprovedParentEmail(db, [studentUserId])
  ).has(studentUserId);
  return decide(profile as ProfileRow | null, viaParent, now);
}

/**
 * THE gate predicate. True ⇒ adult-facing messaging is locked for this student.
 *
 * A student id with NO profile row at all (temp/shell students) is a minor with
 * no channel, so it locks — same default-closed reasoning as isMinorStudent().
 */
export async function isGuardianChannelLocked(
  db: TenantTx,
  studentUserId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await guardianChannelState(db, studentUserId, now)).locked;
}

/**
 * Batch variant — returns the subset of ids that are LOCKED. Used by the
 * directory so `listContacts` hides exactly what `assertCanReach` would refuse.
 * Unknown ids are included (locked), never dropped.
 */
export async function guardianLockedStudentIds(
  db: TenantTx,
  studentUserIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (!studentUserIds.length) return new Set();
  const profiles = await db.studentProfile.findMany({
    where: { userId: { in: studentUserIds } },
    select: SELECT,
  });
  const byId = new Map(
    profiles.map((p) => [p.userId as string, p as ProfileRow]),
  );
  const viaParent = await studentsWithApprovedParentEmail(db, studentUserIds);

  return new Set(
    studentUserIds.filter(
      (id) => decide(byId.get(id), viaParent.has(id), now).locked,
    ),
  );
}

/** The message both the gate and the UI show. One string, one place. */
export const GUARDIAN_LOCK_MESSAGE =
  "Messaging with teachers and center staff is locked until a guardian email is added for this student.";
