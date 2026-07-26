import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminMarkPaymentRefunded } from "@/lib/services/admin/center-money";

// NAMED for what it is. This flips the Payment's STATUS to refunded — the
// center's own bookkeeping transition. It writes NO ledger reversal and returns
// no money. The real refund is the finance surface's refundLessonForStudent,
// which writes the reversal and is limited to one refund per payment (H3).
export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, paymentId } = await ctx.params;
  return ok(await adminMarkPaymentRefunded(user, id, paymentId));
});
