import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminRemoveCenterAdmin } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, userId } = await ctx.params;
  return ok(await adminRemoveCenterAdmin(user, id, userId));
});
