import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminUnenrollStudent } from "@repo/server-core/backoffice/admin/center-academic";

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, enrollmentId } = await ctx.params;
  return ok(await adminUnenrollStudent(user, id, enrollmentId));
});
