import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { getReceipt } from "@/lib/services/payments/payments";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireSession();

  const paymentId = ((await ctx?.params) as { id: string }).id;
  const receipt = await getReceipt(paymentId, user);
  return ok(receipt);
});
