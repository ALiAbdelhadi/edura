import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getIntentForStudent } from "@/lib/services/payments/payment-intents";

export const dynamic = "force-dynamic";

/**
 * Owner-only status polling for the checkout UI. A parent is admitted to the
 * ROLE gate here and narrowed to the intents they actually funded inside
 * getIntentForStudent — one ownership rule, not two.
 */
export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("student", "parent");
  const { id } = await ctx.params;
  return ok(await getIntentForStudent(id, user));
});
