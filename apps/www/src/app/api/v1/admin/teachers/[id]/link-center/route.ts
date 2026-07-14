import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { linkTeacherCenter } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";
const schema = z.object({ centerId: z.string().uuid() });

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { centerId } = await parseJson(req, schema);
  return ok(await linkTeacherCenter(id, centerId, user.id), { status: 201 });
});
