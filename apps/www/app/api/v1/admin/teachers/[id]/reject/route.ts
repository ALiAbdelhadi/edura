import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { rejectTeacher } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";
const schema = z.object({ reason: z.string().trim().min(1).max(500) });

// PRD §4.2 POST /admin/teachers/:id/reject {reason}  [super_admin only]
export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, schema);
  return ok(await rejectTeacher(id, reason, user.id));
});
