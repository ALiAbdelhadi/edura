import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminReassignTeacher } from "@/lib/services/admin/center-academic";

// Named action. The new teacher must have an ACTIVE affiliation with this
// center, and only FUTURE sessions move — a past session records who actually
// taught it, and may already have settled to that person.
export const dynamic = "force-dynamic";

const bodySchema = z.object({ teacherId: z.uuid() }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, courseId } = await ctx.params;
  const { teacherId } = await parseJson(req, bodySchema);
  return ok(await adminReassignTeacher(user, id, courseId, teacherId));
});
