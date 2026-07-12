import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { approveTeacher } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

// PRD §4.2 POST /admin/teachers/:id/approve  [super_admin only]
export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await approveTeacher(id, user.id));
});
