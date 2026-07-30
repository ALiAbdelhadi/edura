import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminCenterDashboard } from "@/lib/services/admin/center-platform";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await adminCenterDashboard(user, id));
});
