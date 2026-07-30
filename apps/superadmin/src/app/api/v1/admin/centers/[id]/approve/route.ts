import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { approveCenter } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await approveCenter(id, user.id));
});
