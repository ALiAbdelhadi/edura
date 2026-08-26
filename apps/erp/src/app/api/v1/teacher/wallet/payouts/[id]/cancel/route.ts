import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { cancelOwnPayoutRequest } from "@repo/server-core/services/finance/payout-cancel";

export const dynamic = "force-dynamic";

/**
 * T-4: a teacher cancels their OWN pending payout request, releasing the H1
 * reserve. `requireRole("teacher")`, NOT delegated() — the wallet is a Step 8
 * hard exclusion, same as the request that created it.
 */
export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("teacher");
  const { id } = await ctx.params;
  return ok(await cancelOwnPayoutRequest(user, id));
});
