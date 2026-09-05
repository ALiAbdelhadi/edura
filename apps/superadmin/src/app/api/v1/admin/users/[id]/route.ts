import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getUserDetail } from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getUserDetail(id));
});
