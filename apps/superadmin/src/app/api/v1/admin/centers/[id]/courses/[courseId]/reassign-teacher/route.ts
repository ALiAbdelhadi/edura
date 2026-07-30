import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminReassignTeacher } from "@/lib/services/admin/center-academic";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ teacherId: z.uuid() }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, courseId } = await ctx.params;
  const { teacherId } = await parseJson(req, bodySchema);
  return ok(await adminReassignTeacher(user, id, courseId, teacherId));
});
