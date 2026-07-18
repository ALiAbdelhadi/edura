import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getPaymentIntent } from "@/lib/services/payments/payment-intents-admin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  await requireRole("accountant", "super_admin");
  const { id } = await ctx.params;
  return ok(await getPaymentIntent(id));
});
