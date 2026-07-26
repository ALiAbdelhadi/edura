import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminCancelCourse } from "@/lib/services/admin/center-academic";

// Named action. Cancels FUTURE sessions and the course; refunds nothing and
// cancels no subscription — already-settled sessions are untouched.
export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, courseId } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await adminCancelCourse(user, id, courseId, reason));
});
