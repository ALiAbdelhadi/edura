import { withErrors } from "@/lib/errors/http";
import { ok, fail } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import { runMonthEndStatements, runLessonReminders } from "@/lib/services/cron/jobs";

export const dynamic = "force-dynamic";

/**
 * Secured scheduler entrypoint (PRD §5.5 month-end, §6 lesson reminders).
 * Protect with CRON_SECRET: callers send `Authorization: Bearer <CRON_SECRET>`
 * (or `x-cron-secret`). In production the secret is REQUIRED; in dev, if unset,
 * the endpoint is open for manual testing.
 *
 * Wire a scheduler to hit:
 *   POST /api/v1/cron/month-end-statements   (monthly, day 1)
 *   POST /api/v1/cron/lesson-reminders       (every ~10 min)
 */
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
    default:
      throw new BusinessRuleError(`Unknown cron job: ${job}`);
  }
});

// GET convenience for schedulers that only issue GETs (same auth).
export const GET = POST;
