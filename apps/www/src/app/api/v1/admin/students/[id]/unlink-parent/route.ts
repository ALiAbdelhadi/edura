import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import { unlinkParent } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  await ctx.params;
  const linkId = new URL(req.url).searchParams.get("linkId");
  if (!linkId) throw new BusinessRuleError("linkId query param is required");
  return ok(await unlinkParent(linkId, user.id));
});
