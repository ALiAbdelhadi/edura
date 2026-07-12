import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { linkParent } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";
const schema = z.object({ parentId: z.string().uuid() });

// PRD §4.2 POST /admin/students/:id/link-parent {parentId}  (:id = student user id)
export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { parentId } = await parseJson(req, schema);
  return ok(await linkParent(id, parentId, user.id), { status: 201 });
});
