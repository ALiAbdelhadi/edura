import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminRemoveCenterAdmin } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

// The "cannot remove the last admin" rule still applies — it lives in the
// kernel service, so a center can never be left ownerless from here either.
export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, userId } = await ctx.params;
  return ok(await adminRemoveCenterAdmin(user, id, userId));
});
