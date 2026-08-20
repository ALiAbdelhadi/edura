import { bearerEquals, secretEquals } from "@repo/server-core/auth/secret-compare";
import { withErrors } from "@/lib/errors/http";
import { ok, fail } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import {
  runMonthEndStatements,
  runLessonReminders,
  runWeeklyCenterDigest,
} from "@/lib/services/cron/jobs";
import { expirePaymentIntents } from "@/lib/services/payments/payment-intents";
import { expireSubscriptions } from "@/lib/services/subscriptions/subscriptions";
import { expireCollaborationRequests } from "@/lib/services/collaboration/collaboration";
import { runGuardianContactReminders } from "@/lib/services/invites/guardian-contact";
import { runDataExportJob } from "@repo/server-core/services/data-rights/data-export";

export const dynamic = "force-dynamic";

// Fail closed, in EVERY environment: with no CRON_SECRET set there is no
// valid caller, so every request is rejected — there is no env-based bypass.
// (These jobs mutate data — statements, expiries — so an open staging/preview
// would let anyone trigger them unauthenticated.)
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Constant-time: `===` on strings stops at the first wrong byte, so failure
  // time leaked how much of the secret a caller had guessed.
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
    case "expire-collaboration-requests":
      return ok(await expireCollaborationRequests(now));
    // Child safety: escalate (never suspend) when a minor still has no
    // guardian email. Reminders before the deadline, center notified after.
    case "guardian-contact-reminders":
      return ok(await runGuardianContactReminders(now));
    // Data rights (Law 151/2020): build queued exports, then drop the payloads
    // of any that have passed their expiry. Both halves are idempotent — the
    // claim is a conditional update, and the sweep is a bounded updateMany —
    // so a double-fired schedule costs a no-op, never a duplicate.
    case "data-exports":
      return ok(await runDataExportJob());
    // The one unprompted email a center owner gets. Idempotent per center per
    // week via an append-only audit row, so a double-fired schedule is a no-op
    // rather than a second copy of last week's figures.
    case "weekly-center-digest":
      return ok(await runWeeklyCenterDigest(now));
    default:
      throw new BusinessRuleError(`Unknown cron job: ${job}`);
  }
});

// POST-only: these jobs mutate data. A plain GET (prefetchers, link scanners,
// crawlers) must never trigger a side-effectful job. The GET = POST alias was
// removed; GET falls through to Next's 405 Method Not Allowed.
