import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { cancelPendingSubscription } from "@repo/server-core/services/subscriptions/subscriptions";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("student", "parent");
  const { id } = await ctx.params;
  return ok(await cancelPendingSubscription(id, user));
});
