import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { removeCenterAdmin } from "@repo/server-core/services/center/admins";

export const DELETE = withErrors(async (_req, ctx) => {
  const adminUser = await requireRole("center_admin");
  const { userId } = await ctx.params;
  return ok(await removeCenterAdmin(adminUser, userId as string, adminUser.id));
});
