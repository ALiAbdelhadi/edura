import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminCenterDashboard } from "@/lib/services/admin/center-platform";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await adminCenterDashboard(user, id));
});
