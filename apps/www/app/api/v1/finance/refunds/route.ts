import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";
import { refundsReport } from "@/lib/services/finance/financeReports";

export const dynamic = "force-dynamic";

// PRD §4.3 / §3.3 — accountant-issued refund. Appends compensating reversal
// entries to the immutable ledger (never edits) and claws the net back out of
// the teacher/center wallets. Reason mandatory (§7 confirmation/reason rule).
const bodySchema = z.object({
  sessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("accountant", "super_admin");
  const { sessionId, studentId, reason } = await parseJson(req, bodySchema);
  return ok(await refundLessonForStudent(sessionId, studentId, reason, user));
});

// Convenience: the refunds report also lives at /finance/reports/refunds.
export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const url = new URL(req.url);
  return ok(await refundsReport(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined));
});
