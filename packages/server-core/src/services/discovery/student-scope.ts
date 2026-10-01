import { platformDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { assertApprovedChild } from "../wallet/parent-wallet-facade";
import type { StudentCatalogScope } from "./discovery";

export async function assertParentOfApprovedChild(parentId: string, studentId: string) {
  await platformDb((tx) => assertApprovedChild(tx, parentId, studentId));
}

export async function resolveStudentCatalogScope(
  user: SessionUser | null,
  browseAll: boolean,
  childId: string | null,
): Promise<StudentCatalogScope | null> {
  let studentScope: StudentCatalogScope | null = null;

  let scopeUserId: string | null = null;
  if (!browseAll && user?.role === "student") {
    scopeUserId = user.id;
  } else if (!browseAll && user?.role === "parent") {
    if (childId) {
      await assertParentOfApprovedChild(user.id, childId);
      scopeUserId = childId;
    }
  }

  if (scopeUserId) {
    const profile = await platformDb((tx) =>
      tx.studentProfile.findUnique({
        where: { userId: scopeUserId },
        select: { onboardingCompleted: true, gradeLevelId: true, trackId: true },
      }),
    );
    if (profile?.onboardingCompleted && profile.gradeLevelId) {
      studentScope = { gradeLevelId: profile.gradeLevelId, trackId: profile.trackId };
    }
  }

  return studentScope;
}
