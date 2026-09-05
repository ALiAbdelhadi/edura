import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminListCenterAdmins } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await adminListCenterAdmins(user, id));
});
