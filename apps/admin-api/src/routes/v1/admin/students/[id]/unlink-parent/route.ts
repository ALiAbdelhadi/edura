import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { unlinkParent } from "@repo/server-core/backoffice/admin/platform";

export const DELETE = withRole("super_admin", async (user, req, ctx) => {
  const { id: studentId } = await ctx.params;
  const linkId = new URL(req.url).searchParams.get("linkId");
  if (!linkId) throw new BusinessRuleError("linkId query param is required");
  return ok(await unlinkParent(linkId, studentId, user.id));
});
