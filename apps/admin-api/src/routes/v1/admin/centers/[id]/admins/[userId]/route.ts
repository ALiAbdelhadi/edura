import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminRemoveCenterAdmin } from "@repo/server-core/backoffice/admin/center-people";

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, userId } = await ctx.params;
  return ok(await adminRemoveCenterAdmin(user, id, userId));
});
