import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { refundLessonForStudent } from "@repo/server-core/backoffice/finance/refunds";

// The only clawback path: a lesson that has already SETTLED has moved money
// into a teacher's or a centre's wallet, and only this service (on platformDb)
// may reach those wallets to take it back. The ERP counter refund refuses such
// a receipt and tells the operator to "refund the lesson instead" — this route
// is what makes that refusal honest (REFUND_DECISION.md §1.1 E5). Restored
// after the L-9 route sweep deleted it as unreachable.
//
// The refunds REPORT lives at /api/v1/finance/reports/refunds.
const bodySchema = z.object({
  sessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

// SECURITY_AUDIT.md M-08: this is the one back-office write that reaches
// teacher and centre WALLETS (a clawback) and credits a family wallet. It is
// not routed through `superadminAsCenter` + a sanctioned centre Tx like the
// centre-money routes are, so it is `super_admin` only.
export const POST = withRole(["super_admin"], async (user, req) => {
  const { sessionId, studentId, reason } = await parseJson(req, bodySchema);
  return ok(await refundLessonForStudent(sessionId, studentId, reason, user));
});
