import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminGetPayment } from "@/lib/services/admin/center-money";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id, paymentId } = await ctx.params;
  return ok(await adminGetPayment(user, id, paymentId));
});
