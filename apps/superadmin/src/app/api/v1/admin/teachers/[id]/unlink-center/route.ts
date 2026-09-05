import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { BusinessRuleError } from "@/lib/errors/classes";
import { unlinkTeacherCenter } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const DELETE = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const centerId = new URL(req.url).searchParams.get("centerId");
  if (!centerId) throw new BusinessRuleError("centerId query param is required");
  return ok(await unlinkTeacherCenter(id, centerId, user.id));
});
