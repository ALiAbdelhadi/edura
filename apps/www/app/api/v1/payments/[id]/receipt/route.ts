import { withErrors } from "@/lib/errors/http";
import { getSessionUser } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { ForbiddenError } from "@/lib/errors/classes";
import { getReceipt } from "@/lib/services/payments/payments";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Not authenticated");

  const paymentId = ((await ctx?.params) as { id: string }).id;
  const receipt = await getReceipt(paymentId, user);
  return ok(receipt);
});
