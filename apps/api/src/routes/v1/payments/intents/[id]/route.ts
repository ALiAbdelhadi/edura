import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getIntentForStudent } from "@repo/server-core/services/payments/payment-intents";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("student", "parent");
  const { id } = await ctx.params;
  return ok(await getIntentForStudent(id, user));
});
