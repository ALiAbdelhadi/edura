import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { cancelOwnPayoutRequest } from "@repo/server-core/services/finance/payout-cancel";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  return ok(await cancelOwnPayoutRequest(user, id));
});
