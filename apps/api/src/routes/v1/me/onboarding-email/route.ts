import { requireSession } from "@repo/server-core/erp-auth/session";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { AppError } from "@repo/server-core/errors/classes";
import { checkRateLimit } from "@repo/server-core/rate-limit/token-bucket";
import {
  sendStudentWelcomeEmail,
  verifyOnboardingToken,
} from "@repo/server-core/services/onboarding/welcome-email";

export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return ok({ status: "invalid" });
  const check = await verifyOnboardingToken(token);
  if (check.status === "valid" && check.userId !== user.id) {
    return ok({ status: "mismatch" });
  }
  return ok({ status: check.status });
});

export const POST = withErrors(async () => {
  const user = await requireSession();
  if (user.role !== "student") return ok({ sent: false, reason: "ineligible" });
  if (!(await checkRateLimit(`onboarding-resend:${user.id}`, 3, 0.1))) {
    throw new AppError(429, "rate_limited", "Too many resend attempts — try again later");
  }
  const result = await sendStudentWelcomeEmail(user.id, { force: true });
  return ok(result);
});
