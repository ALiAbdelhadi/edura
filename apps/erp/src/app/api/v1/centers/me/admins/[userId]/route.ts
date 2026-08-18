import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { removeCenterAdmin } from "@repo/server-core/services/center/admins";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const adminUser = await requireRole("center_admin");
  const { userId } = await ctx.params;
  // The caller is a center owner, so they are the identity that may not remove
  // itself. (A super admin passes null — it is never one of the owners.)
  return ok(await removeCenterAdmin(adminUser, userId as string, adminUser.id));
});
