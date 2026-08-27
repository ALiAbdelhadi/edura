import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { removeCenterAdmin } from "@repo/server-core/services/center/admins";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const adminUser = await requireRole("center_admin");
  const { userId } = await ctx.params;
  return ok(await removeCenterAdmin(adminUser, userId as string, adminUser.id));
});
