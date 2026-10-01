import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminGetPayment } from "@repo/server-core/backoffice/admin/center-money";

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id, paymentId } = await ctx.params;
  return ok(await adminGetPayment(user, id, paymentId));
});
