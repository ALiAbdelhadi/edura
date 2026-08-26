import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { cancelOwnPayoutRequest } from "@repo/server-core/services/finance/payout-cancel";

export const dynamic = "force-dynamic";

/**
 * T-4 (center face): the owner cancels the CENTER's own pending payout
 * request. `center_admin` only, matching the request door — no staff tier
 * touches the wallet.
 */
export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  return ok(await cancelOwnPayoutRequest(user, id));
});
