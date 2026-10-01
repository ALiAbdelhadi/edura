import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminReassignTeacher } from "@repo/server-core/backoffice/admin/center-academic";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z.object({ teacherId: z.uuid() }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, courseId } = await ctx.params;
  const { teacherId } = await parseJson(req, bodySchema);
  return ok(await adminReassignTeacher(user, id, courseId, teacherId));
});
