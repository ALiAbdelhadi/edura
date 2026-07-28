import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { cancelPendingSubscription } from "@/lib/services/subscriptions/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Owner cancel of an UNPAID (pending_payment) subscription — the student it is
 * for, or the parent who started it. Ownership is decided in the service.
 */
export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("student", "parent");
  const { id } = await ctx.params;
  return ok(await cancelPendingSubscription(id, user));
});
