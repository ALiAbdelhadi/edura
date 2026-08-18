import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { send as sendNotification } from "@repo/notifications";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import {
  guardianVerifyLink,
  issueGuardianVerification,
  isGuardianEmailVerified,
  maskEmail,
} from "@repo/server-core/services/invites/guardian-verification";

export const dynamic = "force-dynamic";

/** Current state, for the banner on the student's own screen. */
export const GET = withErrors(async () => {
  const user = await requireRole("student");
  const profile = await platformDb((tx) =>
    tx.studentProfile.findFirst({
      where: { userId: user.id },
      select: {
        guardianEmail: true,
        guardianEmailVerifiedAt: true,
        guardianEmailVerifiedValue: true,
      },
    }),
  );
  if (!profile) throw new NotFoundError("Student profile not found");
  return ok({
    hasGuardianEmail: !!profile.guardianEmail,
    // Masked: the student already knows the address, but this response is one
    // forwarded screenshot away from anywhere, and it costs nothing to keep the
    // full address out of it.
    guardianEmailHint: profile.guardianEmail ? maskEmail(profile.guardianEmail) : null,
    verified: isGuardianEmailVerified(profile),
    verifiedAt: profile.guardianEmailVerifiedAt,
  });
});

/**
 * Send (or resend) the verification link to the guardian address on file.
 *
 * The student may trigger it but never chooses the destination — it always goes
 * to the stored address. A student who could name the recipient could verify an
 * address of their own choosing, which is the exact hole this closes.
 */
export const POST = withRateLimit(
  withErrors(async () => {
    const user = await requireRole("student");
    const { token, email, expiresAt } = await issueGuardianVerification({
      studentUserId: user.id,
      actorId: user.id,
    });
    const locale = user.locale === "en" ? "en" : "ar";
    const days = Math.max(
      1,
      Math.round((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );

    await sendNotification(
      "guardian_verification",
      { email, locale, userId: user.id },
      {
        studentName: user.name ?? "",
        link: guardianVerifyLink(token, locale),
        expiryDays: days,
      },
    );

    // The token is NOT returned. Unlike a walk-in invite — handed over a
    // counter to someone standing there — this one exists to prove an address
    // is reachable, so handing it back to the student would defeat it entirely.
    return ok({ sent: true, guardianEmailHint: maskEmail(email) });
  }),
  5,
  60,
);
