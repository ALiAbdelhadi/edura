import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminRemoveTeacher } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

// Refused while the teacher still has active courses at this center — the same
// business rule the center is held to, enforced in the shared kernel.
export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, teacherId } = await ctx.params;
  return ok(await adminRemoveTeacher(user, id, teacherId));
});
