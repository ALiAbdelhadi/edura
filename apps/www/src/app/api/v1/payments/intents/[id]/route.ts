import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getIntentForStudent } from "@/lib/services/payments/payment-intents";

export const dynamic = "force-dynamic";

/** Owner-only status polling for the checkout UI. */
export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("student");
  const { id } = await ctx.params;
  return ok(await getIntentForStudent(id, user));
});
