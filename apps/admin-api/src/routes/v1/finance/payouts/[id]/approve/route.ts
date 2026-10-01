import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { approvePayout } from "@repo/server-core/backoffice/finance/payouts";

export const POST = withRole(["accountant", "super_admin"], async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await approvePayout(id, user));
});
