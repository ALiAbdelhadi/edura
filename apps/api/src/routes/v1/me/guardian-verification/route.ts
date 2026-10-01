import { requireRole } from "@repo/server-core/authz/require-role";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { send as sendNotification } from "@repo/notifications";
import {
  guardianVerifyLink,
  issueGuardianVerification,
  maskEmail,
} from "@repo/server-core/services/invites/guardian-verification";
import { getGuardianVerificationStatus } from "@repo/server-core/services/invites/guardian-verification-status";

export const GET = withErrors(async () => {
  const user = await requireRole("student");
  return ok(await getGuardianVerificationStatus(user.id));
});

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

    return ok({ sent: true, guardianEmailHint: maskEmail(email) });
  }),
  5,
  60,
);
