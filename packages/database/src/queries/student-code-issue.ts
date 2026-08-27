import { createHash } from "node:crypto";
import type { TenantTx } from "../client";
import {
  PENDING_SYSTEM_LETTER,
  buildStudentCode,
  isPendingStudentCode,
  studentCodeBodyFromDigest,
} from "./student-code";

const DIGEST_PREFIX = "edura:student-code:v1:";

export function deriveStudentCodeBody(profileId: string, attempt = 0): string {
  const digest = createHash("sha256").update(`${DIGEST_PREFIX}${profileId}:${attempt}`).digest();
  return studentCodeBodyFromDigest(digest);
}

export type FinalizeResult = {
  studentCode: string;
  changed: boolean;
};

export async function finalizeStudentCode(
  tx: TenantTx,
  studentUserId: string,
): Promise<FinalizeResult | null> {
  const profile = await tx.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: {
      id: true,
      studentCode: true,
      educationSystem: { select: { codeLetter: true } },
    },
  });
  if (!profile) return null;
  if (!isPendingStudentCode(profile.studentCode)) {
    return { studentCode: profile.studentCode, changed: false };
  }

  const letter = profile.educationSystem?.codeLetter;
  if (!letter || letter === PENDING_SYSTEM_LETTER) {
    return { studentCode: profile.studentCode, changed: false };
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = buildStudentCode(letter, deriveStudentCodeBody(profile.id, attempt));
    const taken = await tx.studentProfile.findUnique({
      where: { studentCode: candidate },
      select: { id: true },
    });
    if (taken && taken.id !== profile.id) continue;

    const written = await tx.studentProfile.updateMany({
      where: { id: profile.id, studentCode: { startsWith: PENDING_SYSTEM_LETTER } },
      data: { studentCode: candidate },
    });
    if (written.count === 0) {
      const now = await tx.studentProfile.findUnique({
        where: { id: profile.id },
        select: { studentCode: true },
      });
      return { studentCode: now?.studentCode ?? profile.studentCode, changed: false };
    }
    return { studentCode: candidate, changed: true };
  }

  throw new Error(`could not issue a student code for profile ${profile.id}`);
}
