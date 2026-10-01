import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminListCenterAdmins } from "@repo/server-core/backoffice/admin/center-people";

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await adminListCenterAdmins(user, id));
});
