import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminReassignTeacher } from "@/lib/services/admin/center-academic";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ teacherId: z.uuid() }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, courseId } = await ctx.params;
  const { teacherId } = await parseJson(req, bodySchema);
  return ok(await adminReassignTeacher(user, id, courseId, teacherId));
});
