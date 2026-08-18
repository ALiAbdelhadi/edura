import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import { unlinkParent } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  // The path student id is now PASSED to the service, not awaited and dropped:
  // the link must belong to the student this URL names, so the action and the
  // audit row it writes cannot disagree.
  const { id: studentId } = await ctx.params;
  const linkId = new URL(req.url).searchParams.get("linkId");
  if (!linkId) throw new BusinessRuleError("linkId query param is required");
  return ok(await unlinkParent(linkId, studentId, user.id));
});
