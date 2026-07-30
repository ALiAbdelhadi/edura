import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminMarkPaymentRefunded } from "@/lib/services/admin/center-money";

export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, paymentId } = await ctx.params;
  return ok(await adminMarkPaymentRefunded(user, id, paymentId));
});
