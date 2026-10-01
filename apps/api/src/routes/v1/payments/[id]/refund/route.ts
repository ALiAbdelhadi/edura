import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { refundPayment, COUNTER_REFUND_CHANNELS } from "@repo/server-core/services/payments/refund-payment";

const refundSchema = z.object({
  // POSITIVE piasters. The sign belongs to the row the service writes, not to
  // the request — a negative amount on the wire is what REFUND_DECISION.md §1.1
  // describes as the whole problem.
  amount: moneySchema,
  reason: z.string().trim().min(1),
  // Where the money goes back. `wallet` is absent on purpose — see
  // COUNTER_REFUND_CHANNELS and WALLET_SPENDABILITY.md.
  refundChannel: z.enum(COUNTER_REFUND_CHANNELS),
  clientRequestId: z.string().min(1).max(200).optional(),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const paymentId = ((await ctx?.params) as { id: string }).id;
  const data = await parseJson(req, refundSchema);
  const refund = await refundPayment({ ...data, paymentId }, user);
  return ok(refund, { status: 201 });
});
