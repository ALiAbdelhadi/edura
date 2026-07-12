import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getStudent } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

// PRD §4.2 GET /admin/students/:id
export const GET = withErrors(async (_req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await getStudent(id));
});
