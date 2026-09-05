import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { approveCenter } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const POST = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await approveCenter(id, user.id));
});
