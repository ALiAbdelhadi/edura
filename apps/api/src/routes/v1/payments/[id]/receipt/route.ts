import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { getReceipt } from "@repo/server-core/services/payments/payments";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireSession();

  const paymentId = ((await ctx?.params) as { id: string }).id;
  const receipt = await getReceipt(paymentId, user);
  return ok(receipt);
});
