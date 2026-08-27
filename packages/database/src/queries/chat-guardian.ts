import type { TenantTx } from "../client";
import { isMinorFromProfile } from "./chat-minors";

export type GuardianChannelState = {
  isMinor: boolean;
  hasGuardianChannel: boolean;
  locked: boolean;
  guardianEmail: string | null;
  guardianPhone: string | null;
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
    locked: minor && !hasGuardianChannel,
    guardianEmail: profile?.guardianEmail ?? null,
    guardianPhone: profile?.guardianPhone ?? null,
    dueAt,
    overdue: !!dueAt && dueAt.getTime() < now.getTime(),
  };
}

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

export async function isGuardianChannelLocked(
  db: TenantTx,
  studentUserId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await guardianChannelState(db, studentUserId, now)).locked;
}

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

export const GUARDIAN_LOCK_MESSAGE =
  "Messaging with teachers and center staff is locked until a guardian email is added for this student.";
