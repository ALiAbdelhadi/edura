// Onboarding-link companion endpoint.
//   GET  ?token=…  → { status: valid | expired | invalid | mismatch }
//                    (mismatch = signed for a different signed-in student)
//   POST           → re-send the welcome email to the SIGNED-IN student.
//                    Rate-limited (burst 3, ~1 refill / 10 min per user) —
//                    this is the "resend link" action on the friendly
//                    expired-token state, so it must exist but not be a
//                    mail cannon.
import { requireSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { AppError } from "@/lib/errors/classes";
import { checkRateLimit } from "@/lib/rate-limit/token-bucket";
import {
  sendStudentWelcomeEmail,
  verifyOnboardingToken,
} from "@/lib/services/onboarding/welcome-email";

export const dynamic = "force-dynamic";

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
