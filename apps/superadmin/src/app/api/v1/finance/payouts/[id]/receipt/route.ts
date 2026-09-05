import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getPayoutReceipt } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

export const GET = withRole(["accountant", "super_admin"], async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getPayoutReceipt(id));
});
