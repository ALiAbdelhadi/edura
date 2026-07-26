import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminGetPayment } from "@/lib/services/admin/center-money";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, paymentId } = await ctx.params;
  return ok(await adminGetPayment(user, id, paymentId));
});
