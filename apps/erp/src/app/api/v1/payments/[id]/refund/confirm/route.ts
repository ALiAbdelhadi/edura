import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { confirmRefund } from "@/lib/services/payments/refund-payment";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  // The evidence. The DB will not accept a confirmation without it
  // (payments_refund_confirmation_complete), so there is no "confirmed, no
  // proof" state to reach from here either.
  externalRef: z.string().trim().min(1).max(200),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const refundPaymentId = ((await ctx?.params) as { id: string }).id;
  const { externalRef } = await parseJson(req, confirmSchema);
  const confirmed = await confirmRefund({ refundPaymentId, externalRef }, user);
  return ok(confirmed);
});
