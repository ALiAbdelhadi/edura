import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { unlinkTeacherCenter } from "@repo/server-core/backoffice/admin/platform";

export const DELETE = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const centerId = new URL(req.url).searchParams.get("centerId");
  if (!centerId) throw new BusinessRuleError("centerId query param is required");
  return ok(await unlinkTeacherCenter(id, centerId, user.id));
});
