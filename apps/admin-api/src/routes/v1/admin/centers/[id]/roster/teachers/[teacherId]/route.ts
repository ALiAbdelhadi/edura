import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminRemoveTeacher } from "@repo/server-core/backoffice/admin/center-people";

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, teacherId } = await ctx.params;
  return ok(await adminRemoveTeacher(user, id, teacherId));
});
