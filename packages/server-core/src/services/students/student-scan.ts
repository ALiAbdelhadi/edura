import { platformDb, type TenantTx } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { maskName } from "./disclosure";
import { readStudentScan } from "./student-qr";

export type StudentScanResult =
  | { outcome: "unreadable" }
  | { outcome: "invalid" }
  | {
      outcome: "revoked";
      revokedAt: Date;
      reason: string;
      identity: ScanIdentity;
    }
  | {
      outcome: "superseded";
      currentVersion: number;
      scannedVersion: number;
      identity: ScanIdentity;
    }
  | {
      outcome: "valid";
      identity: ScanIdentity;
      counter: { studentId: string; onOurRoster: boolean } | null;
      door: { studentId: string } | null;
    };

export type ScanIdentity = {
  studentId: string | null;
  name: string | null;
  studentCode: string;
  educationSystem: { nameAr: string; nameEn: string | null } | null;
  gradeLevel: { nameAr: string; nameEn: string | null } | null;
  track: { nameAr: string; nameEn: string | null } | null;
  tier: "counter" | "teacher" | "signed_in" | "public";
};

const COUNTER_ROLES = new Set(["center_admin", "center_staff"]);

const TEACHER_ROLES = new Set(["teacher", "assistant"]);

export async function resolveStudentScan(
  raw: string,
  viewer: SessionUser | null,
): Promise<StudentScanResult> {
  const scan = readStudentScan(raw);
  if (scan.kind === "unreadable") return { outcome: "unreadable" };

  if (scan.kind === "scanned_code" && !viewer) return { outcome: "invalid" };
  if (scan.kind === "forged") return { outcome: "invalid" };

  return platformDb(async (tx) => {
    const profile = await tx.studentProfile.findUnique({
      where: { studentCode: scan.code },
      select: {
        userId: true,
        fullName: true,
        qrVersion: true,
        qrRevokedAt: true,
        qrRevokedReason: true,
        user: { select: { id: true, name: true, status: true, deletedAt: true } },
        educationSystem: { select: { nameAr: true, nameEn: true } },
        gradeLevel: { select: { nameAr: true, nameEn: true } },
        track: { select: { nameAr: true, nameEn: true } },
      },
    });

    if (!profile || !profile.userId || profile.user?.deletedAt) {
      return { outcome: "invalid" };
    }

    const studentId = profile.userId;

    let tier: ScanIdentity["tier"] = "public";
    let onOurRoster = false;
    if (viewer) {
      tier = "signed_in";
      if (COUNTER_ROLES.has(viewer.role) && viewer.centerId) {
        const roster = await tx.centerStudentRoster.findFirst({
          where: { centerId: viewer.centerId, studentId, leftAt: null },
          select: { id: true },
        });
        onOurRoster = roster !== null;
        if (onOurRoster) tier = "counter";
      } else if (TEACHER_ROLES.has(viewer.role)) {
        const teacherId = await actingTeacherId(tx, viewer);
        if (teacherId) {
          const taught = await tx.enrollment.findFirst({
            where: { studentId, status: "active", course: { teacherId } },
            select: { id: true },
          });
          if (taught) tier = "teacher";
        }
      }
    }

    const full = tier === "counter" || tier === "teacher";

    const fullName = profile.user?.name ?? profile.fullName;
    const identity: ScanIdentity = {
      studentId: full ? studentId : null,
      name: full ? fullName : maskName(fullName),
      studentCode: scan.code,
      educationSystem: profile.educationSystem,
      gradeLevel: full ? profile.gradeLevel : null,
      track: full ? profile.track : null,
      tier,
    };

    if (profile.qrRevokedAt) {
      return {
        outcome: "revoked" as const,
        revokedAt: profile.qrRevokedAt,
        reason: profile.qrRevokedReason ?? "",
        identity,
      };
    }

    if (scan.kind === "signed" && scan.version !== profile.qrVersion) {
      return {
        outcome: "superseded" as const,
        currentVersion: profile.qrVersion,
        scannedVersion: scan.version,
        identity,
      };
    }

    return {
      outcome: "valid" as const,
      identity,
      counter: tier === "counter" ? { studentId, onOurRoster } : null,
      door: tier === "teacher" ? { studentId } : null,
    };
  });
}

async function actingTeacherId(
  tx: TenantTx,
  viewer: SessionUser,
): Promise<string | null> {
  if (viewer.role === "teacher") return viewer.id;
  const link = await tx.teacherAssistant.findFirst({
    where: { assistantId: viewer.id, removedAt: null },
    select: { teacherId: true },
  });
  return link?.teacherId ?? null;
}
