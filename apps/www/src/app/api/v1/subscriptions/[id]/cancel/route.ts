import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { cancelPendingSubscription } from "@/lib/services/subscriptions/subscriptions";

export const dynamic = "force-dynamic";

/** Owner cancel of an UNPAID (pending_payment) subscription. */
export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("student");
  const { id } = await ctx.params;
  return ok(await cancelPendingSubscription(id, user));
});
