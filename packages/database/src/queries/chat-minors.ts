import type { TenantTx } from "../client";
import type { Role } from "../generated/client/index";

export const ADULT_AGE = 18;

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

export function ageOn(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function isMinorFromProfile(
  p: MinorInputs | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!p?.dateOfBirth || !p.dateOfBirthVerifiedAt) return true;
  return ageOn(p.dateOfBirth, now) < ADULT_AGE;
}

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
