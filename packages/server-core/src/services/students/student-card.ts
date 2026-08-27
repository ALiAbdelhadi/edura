import { platformDb } from "../../db/scope";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { assertApprovedChild } from "../wallet/parent-wallet";
import { isPendingStudentCode } from "@repo/database/student-code";
import { buildStudentQrUrl } from "./student-qr";

export type StudentCard = {
  studentId: string;
  name: string;
  studentCode: string;
  isPending: boolean;
  educationSystem: { nameAr: string; nameEn: string | null } | null;
  stage: { nameAr: string; nameEn: string | null } | null;
  gradeLevel: { nameAr: string; nameEn: string | null } | null;
  track: { nameAr: string; nameEn: string | null } | null;
  memberSince: Date;
  patternSeed: string;
  qr: StudentCardQr;
};

export type StudentCardQr = {
  url: string;
  version: number;
  issuedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
};

export async function buildStudentCard(
  studentUserId: string,
  caller: SessionUser,
): Promise<StudentCard> {
  return platformDb(async (tx) => {
    if (caller.role === "student") {
      if (caller.id !== studentUserId) {
        throw new ForbiddenError("Not your student card");
      }
    } else if (caller.role === "parent") {
      await assertApprovedChild(tx, caller.id, studentUserId);
    } else if (caller.role === "super_admin") {
      await tx.auditLog.create({
        data: {
          actorId: caller.id,
          action: "student.card_viewed",
          targetType: "student",
          targetId: studentUserId,
        },
      });
    } else {
      throw new ForbiddenError("Not allowed to view this student card");
    }

    const user = await tx.user.findFirst({
      where: { id: studentUserId, role: "student", deletedAt: null },
      select: { id: true, name: true, phone: true, createdAt: true },
    });
    if (!user) throw new NotFoundError("Student not found");

    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: {
        studentCode: true,
        qrVersion: true,
        qrIssuedAt: true,
        qrRevokedAt: true,
        qrRevokedReason: true,
        phone: true,
        guardianEmail: true,
        onboardingCompleted: true,
        gradeLevelId: true,
        educationSystem: { select: { nameAr: true, nameEn: true } },
        stage: { select: { nameAr: true, nameEn: true } },
        gradeLevel: { select: { nameAr: true, nameEn: true } },
        track: { select: { nameAr: true, nameEn: true } },
      },
    });
    if (!profile) throw new NotFoundError("Student profile not found");

    if (caller.role !== "super_admin") {
      const complete = isProfileComplete({
        name: user.name,
        userPhone: user.phone,
        profilePhone: profile.phone,
        guardianEmail: profile.guardianEmail,
        onboardingCompleted: profile.onboardingCompleted,
        gradeLevelId: profile.gradeLevelId,
      });
      if (!complete) {
        throw new BusinessRuleError("PROFILE_INCOMPLETE");
      }
    }

    return {
      studentId: user.id,
      name: user.name,
      studentCode: profile.studentCode,
      isPending: isPendingStudentCode(profile.studentCode),
      educationSystem: profile.educationSystem,
      stage: profile.stage,
      gradeLevel: profile.gradeLevel,
      track: profile.track,
      memberSince: user.createdAt,
      patternSeed: user.id,
      qr: {
        url: buildStudentQrUrl(profile.studentCode, profile.qrVersion),
        version: profile.qrVersion,
        issuedAt: profile.qrIssuedAt,
        revokedAt: profile.qrRevokedAt,
        revokedReason: profile.qrRevokedReason,
      },
    };
  });
}

export type CardCredentialResult = {
  version: number;
  issuedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
};

function asCredential(row: {
  qrVersion: number;
  qrIssuedAt: Date | null;
  qrRevokedAt: Date | null;
  qrRevokedReason: string | null;
}): CardCredentialResult {
  return {
    version: row.qrVersion,
    issuedAt: row.qrIssuedAt,
    revokedAt: row.qrRevokedAt,
    revokedReason: row.qrRevokedReason,
  };
}

function assertSuperAdmin(caller: SessionUser) {
  if (caller.role !== "super_admin") {
    throw new ForbiddenError("Only a super admin may act on a student card");
  }
}

function requireReason(reason: string): string {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) {
    throw new BusinessRuleError("A reason is required");
  }
  return trimmed;
}

export async function reissueStudentCard(
  studentUserId: string,
  caller: SessionUser,
  reason: string,
): Promise<CardCredentialResult> {
  assertSuperAdmin(caller);
  const why = requireReason(reason);

  return platformDb(async (tx) => {
    const before = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { qrVersion: true, qrRevokedAt: true, qrRevokedReason: true },
    });
    if (!before) throw new NotFoundError("Student profile not found");

    const after = await tx.studentProfile.update({
      where: { userId: studentUserId },
      data: {
        qrVersion: { increment: 1 },
        qrIssuedAt: new Date(),
        qrRevokedAt: null,
        qrRevokedReason: null,
      },
      select: {
        qrVersion: true,
        qrIssuedAt: true,
        qrRevokedAt: true,
        qrRevokedReason: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: caller.id,
        action: "student.card_reissued",
        targetType: "student",
        targetId: studentUserId,
        beforeState: {
          version: before.qrVersion,
          revoked: before.qrRevokedAt !== null,
        },
        afterState: { version: after.qrVersion, reason: why },
      },
    });

    return asCredential(after);
  });
}

export async function revokeStudentCard(
  studentUserId: string,
  caller: SessionUser,
  reason: string,
): Promise<CardCredentialResult> {
  assertSuperAdmin(caller);
  const why = requireReason(reason);

  return platformDb(async (tx) => {
    const before = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { qrVersion: true, qrRevokedAt: true },
    });
    if (!before) throw new NotFoundError("Student profile not found");
    if (before.qrRevokedAt) {
      throw new BusinessRuleError("This card is already revoked");
    }

    const after = await tx.studentProfile.update({
      where: { userId: studentUserId },
      data: { qrRevokedAt: new Date(), qrRevokedReason: why },
      select: {
        qrVersion: true,
        qrIssuedAt: true,
        qrRevokedAt: true,
        qrRevokedReason: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: caller.id,
        action: "student.card_revoked",
        targetType: "student",
        targetId: studentUserId,
        beforeState: { version: before.qrVersion, revoked: false },
        afterState: { version: after.qrVersion, revoked: true, reason: why },
      },
    });

    return asCredential(after);
  });
}

export type ProfileChecklistItem = {
  key: "name" | "phone" | "guardianEmail" | "academic";
  done: boolean;
  blocking: boolean;
  fixHref: string | null;
};

export type ProfileChecklist = {
  items: ProfileChecklistItem[];
  completed: number;
  total: number;
  cardAvailable: boolean;
};

type CompletenessRow = {
  name: string;
  userPhone: string | null;
  profilePhone: string | null;
  guardianEmail: string | null;
  onboardingCompleted: boolean;
  gradeLevelId: string | null;
};

function checklistItems(row: CompletenessRow): ProfileChecklistItem[] {
  return [
    {
      key: "name",
      done: row.name.trim().length > 0,
      blocking: false,
      fixHref: "/dashboard/student/settings",
    },
    {
      key: "phone",
      done: Boolean(row.userPhone ?? row.profilePhone),
      blocking: false,
      fixHref: "/dashboard/student/settings",
    },
    {
      key: "guardianEmail",
      done: Boolean(row.guardianEmail),
      blocking: true,
      fixHref: null,
    },
    {
      key: "academic",
      done: row.onboardingCompleted && Boolean(row.gradeLevelId),
      blocking: true,
      fixHref: "/onboarding",
    },
  ];
}

function isProfileComplete(row: CompletenessRow): boolean {
  return checklistItems(row).every((i) => i.done);
}

export async function buildProfileChecklist(
  studentUserId: string,
  caller: SessionUser,
): Promise<ProfileChecklist> {
  return platformDb(async (tx) => {
    if (caller.role === "student") {
      if (caller.id !== studentUserId) throw new ForbiddenError("Not your profile");
    } else if (caller.role === "parent") {
      await assertApprovedChild(tx, caller.id, studentUserId);
    } else {
      throw new ForbiddenError("Not allowed");
    }

    const user = await tx.user.findFirst({
      where: { id: studentUserId, role: "student", deletedAt: null },
      select: { name: true, phone: true },
    });
    if (!user) throw new NotFoundError("Student not found");

    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: {
        phone: true,
        guardianEmail: true,
        onboardingCompleted: true,
        gradeLevelId: true,
        studentCode: true,
      },
    });
    if (!profile) throw new NotFoundError("Student profile not found");

    const row: CompletenessRow = {
      name: user.name,
      userPhone: user.phone,
      profilePhone: profile.phone,
      guardianEmail: profile.guardianEmail,
      onboardingCompleted: profile.onboardingCompleted,
      gradeLevelId: profile.gradeLevelId,
    };
    const items = checklistItems(row);

    return {
      items,
      completed: items.filter((i) => i.done).length,
      total: items.length,
      cardAvailable:
        items.every((i) => i.done) && !isPendingStudentCode(profile.studentCode),
    };
  });
}
