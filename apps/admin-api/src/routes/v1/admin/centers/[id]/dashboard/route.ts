import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminCenterDashboard } from "@repo/server-core/backoffice/admin/center-platform";

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await adminCenterDashboard(user, id));
});
