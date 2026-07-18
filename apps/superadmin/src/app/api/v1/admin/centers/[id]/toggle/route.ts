import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { toggleCenter } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const PATCH = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await toggleCenter(id, user.id));
});
