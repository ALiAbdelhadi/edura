import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminRemoveTeacher } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, teacherId } = await ctx.params;
  return ok(await adminRemoveTeacher(user, id, teacherId));
});
