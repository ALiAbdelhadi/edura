import { platformDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import { isGuardianEmailVerified, maskEmail } from "./guardian-verification";

export async function getGuardianVerificationStatus(studentUserId: string) {
  const profile = await platformDb((tx) =>
    tx.studentProfile.findFirst({
      where: { userId: studentUserId },
      select: {
        guardianEmail: true,
        guardianEmailVerifiedAt: true,
        guardianEmailVerifiedValue: true,
      },
    }),
  );
  if (!profile) throw new NotFoundError("Student profile not found");
  return {
    hasGuardianEmail: !!profile.guardianEmail,
    guardianEmailHint: profile.guardianEmail ? maskEmail(profile.guardianEmail) : null,
    verified: isGuardianEmailVerified(profile),
    verifiedAt: profile.guardianEmailVerifiedAt,
  };
}
