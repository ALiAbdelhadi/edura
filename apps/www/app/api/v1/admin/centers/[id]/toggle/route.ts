import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { toggleCenter } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

// PRD §4.2 PATCH /admin/centers/:id/toggle  enable/disable  [super_admin only]
export const PATCH = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await toggleCenter(id, user.id));
});
