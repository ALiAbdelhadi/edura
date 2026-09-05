import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import { unlinkParent } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const DELETE = withRole("super_admin", async (user, req, ctx) => {
  const { id: studentId } = await ctx.params;
  const linkId = new URL(req.url).searchParams.get("linkId");
  if (!linkId) throw new BusinessRuleError("linkId query param is required");
  return ok(await unlinkParent(linkId, studentId, user.id));
});
