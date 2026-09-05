import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminCancelCourse } from "@/lib/services/admin/center-academic";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, courseId } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await adminCancelCourse(user, id, courseId, reason));
});
