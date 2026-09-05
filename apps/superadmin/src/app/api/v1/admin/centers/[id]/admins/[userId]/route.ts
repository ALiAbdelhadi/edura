import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminRemoveCenterAdmin } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, userId } = await ctx.params;
  return ok(await adminRemoveCenterAdmin(user, id, userId));
});
