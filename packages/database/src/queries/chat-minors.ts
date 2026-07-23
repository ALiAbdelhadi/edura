// =============================================================================
// Child safety — is this student a MINOR?  ONE implementation, used by every
// caller (parent oversight, report triage, the disclosure banner).
//
// DEFAULT-MINOR BY DESIGN (approved 2026-07-22). A student counts as an adult
// ONLY when a VERIFIED date of birth proves they are 18 or older. Every other
// state — no DOB, a DOB nobody has verified, a DOB under 18 — is a MINOR, so
// parent oversight stays active.
//
// The rule is written as a single POSITIVE adult condition rather than a chain
// of negative checks: there is exactly one way out of "minor", so a new field,
// a NULL, or a parsing failure can never silently promote a child to an adult.
// On a K-12 platform the safe failure mode is more protection, not less.
// =============================================================================

import type { TenantTx } from "../client";
import type { Role } from "../generated/client/index";

export const ADULT_AGE = 18;

/** The roles that count as ADULTS for oversight purposes. */
export const ADULT_ROLES: readonly Role[] = [
  "teacher",
  "assistant",
  "center_admin",
  "center_staff",
];

export function isAdultRole(role: Role | null | undefined): boolean {
  return !!role && ADULT_ROLES.includes(role);
}

export type MinorInputs = {
  dateOfBirth: Date | null;
  dateOfBirthVerifiedAt: Date | null;
};

/** Completed years between `dob` and `now` (calendar-correct, no rounding). */
export function ageOn(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * THE rule. Adult requires ALL of: a DOB, a verification stamp on it, and an
 * age >= 18. Anything else is a minor.
 */
export function isMinorFromProfile(
  p: MinorInputs | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!p?.dateOfBirth || !p.dateOfBirthVerifiedAt) return true;
  return ageOn(p.dateOfBirth, now) < ADULT_AGE;
}

/**
 * Look up a student user's minor status. A student with NO profile row at all
 * (temp/shell students) is a minor — same default-closed reasoning.
 */
export async function isMinorStudent(
  db: TenantTx,
  studentUserId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const profile = await db.studentProfile.findFirst({
    where: { userId: studentUserId },
    select: { dateOfBirth: true, dateOfBirthVerifiedAt: true },
  });
  return isMinorFromProfile(profile, now);
}

/** Batch variant — returns the ids that are MINORS (unknown ids included). */
export async function minorStudentIds(
  db: TenantTx,
  studentUserIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (!studentUserIds.length) return new Set();
  const profiles = await db.studentProfile.findMany({
    where: { userId: { in: studentUserIds } },
    select: { userId: true, dateOfBirth: true, dateOfBirthVerifiedAt: true },
  });
  const byId = new Map(profiles.map((p) => [p.userId as string, p]));
  return new Set(
    studentUserIds.filter((id) => isMinorFromProfile(byId.get(id), now)),
  );
}
