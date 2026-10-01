import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { removeRosterTeacher } from "@repo/server-core/services/center/roster";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { teacherId } = await ctx.params;
  return ok(await removeRosterTeacher(user, teacherId as string));
});
