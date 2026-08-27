import { delegated } from "@/lib/authz/teacher-actor";
import { ok } from "@/lib/http/envelope";
import { getTeacherCoverage } from "@repo/server-core/services/subscriptions/teacher-coverage";

export const dynamic = "force-dynamic";

/**
 * Which of my students' coverage lapsed, per group — TEACHER_IA_AUDIT §3.3.
 *
 * `delegated()`, not `requireRole("teacher")`, deliberately: the assistant
 * already reads per-session `coverage[]` booleans through the attendance GET,
 * and this is the same fact at group grain. It is a coverage READ, not a
 * wallet/payout/financial-settings surface, so the Step 8 money exclusion does
 * not apply. Prices, payers and receipts are deliberately absent from the
 * payload (see the service header).
 *
 * `from`/`to` (Cairo day strings) bound only the per-session pass count;
 * omitted, the service defaults to the last 30 days and echoes the window.
 */
export const GET = delegated(async (req, _ctx, { acting }) => {
  const sp = new URL(req.url).searchParams;
  const result = await getTeacherCoverage(acting, {
    courseId: sp.get("courseId") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  return ok(result);
});
