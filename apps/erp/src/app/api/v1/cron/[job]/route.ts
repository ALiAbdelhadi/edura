import { bearerEquals, secretEquals } from "@repo/server-core/auth/secret-compare";
import { withErrors } from "@/lib/errors/http";
import { ok, fail } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import {
  runMonthEndStatements,
  runLessonReminders,
  runSubscriptionRenewalReminders,
  runWeeklyCenterDigest,
} from "@/lib/services/cron/jobs";
import { expirePaymentIntents } from "@/lib/services/payments/payment-intents";
import { expireSubscriptions } from "@/lib/services/subscriptions/subscriptions";
import { expireCollaborationRequests } from "@/lib/services/collaboration/collaboration";
import { runGuardianContactReminders } from "@/lib/services/invites/guardian-contact";
import { runDataExportJob } from "@repo/server-core/services/data-rights/data-export";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    bearerEquals(req.headers.get("authorization"), secret) ||
    secretEquals(req.headers.get("x-cron-secret"), secret)
  );
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
    case "subscription-renewal-reminders":
      return ok(await runSubscriptionRenewalReminders(now));
    case "expire-collaboration-requests":
      return ok(await expireCollaborationRequests(now));
    case "guardian-contact-reminders":
      return ok(await runGuardianContactReminders(now));
    case "data-exports":
      return ok(await runDataExportJob());
    case "weekly-center-digest":
      return ok(await runWeeklyCenterDigest(now));
    default:
      throw new BusinessRuleError(`Unknown cron job: ${job}`);
  }
});
