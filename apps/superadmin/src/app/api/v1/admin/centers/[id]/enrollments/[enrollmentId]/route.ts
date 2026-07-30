import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminUnenrollStudent } from "@/lib/services/admin/center-academic";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, enrollmentId } = await ctx.params;
  return ok(await adminUnenrollStudent(user, id, enrollmentId));
});
