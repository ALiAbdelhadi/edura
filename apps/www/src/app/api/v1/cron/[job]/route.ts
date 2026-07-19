import { withErrors } from "@/lib/errors/http";
import { ok, fail } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import { runMonthEndStatements, runLessonReminders } from "@/lib/services/cron/jobs";
import { expirePaymentIntents } from "@/lib/services/payments/payment-intents";
import { expireSubscriptions } from "@/lib/services/subscriptions/subscriptions";
import { expireCollaborationRequests } from "@/lib/services/collaboration/collaboration";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization");
  const header = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || header === secret;
}

export const POST = withErrors(async (req, ctx) => {
  if (!authorized(req)) return fail(401, "unauthenticated", "Invalid or missing cron secret");
  const { job } = await ctx.params;
  const now = new Date();
  switch (job) {
    case "month-end-statements":
      return ok(await runMonthEndStatements(now));
    case "lesson-reminders":
      return ok(await runLessonReminders(now));
    case "expire-payment-intents":
      return ok(await expirePaymentIntents(now));
    case "expire-subscriptions":
      return ok(await expireSubscriptions(now));
    case "expire-collaboration-requests":
      return ok(await expireCollaborationRequests(now));
    default:
      throw new BusinessRuleError(`Unknown cron job: ${job}`);
  }
});

export const GET = POST;
