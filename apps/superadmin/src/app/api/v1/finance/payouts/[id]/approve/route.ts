import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { approvePayout } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

export const POST = withRole(["accountant", "super_admin"], async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await approvePayout(id, user));
});
