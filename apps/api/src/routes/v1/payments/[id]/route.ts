import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { getPayment } from "@repo/server-core/services/payments/payments";

// GET only. The PATCH that flipped `status` to "refunded" was deleted with the
// refund foundation: it moved no money, wrote no ledger row, and no report read
// the flag (REFUND_DECISION.md §1.1 E2). A refund is POST /payments/[id]/refund.
export const GET = withErrors(async (_req, ctx) => {
  const user = await requireSession();

  const paymentId = ((await ctx?.params) as { id: string }).id;
  const payment = await getPayment(paymentId, user);
  return ok(payment);
});
