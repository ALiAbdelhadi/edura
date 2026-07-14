import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { revokeLink } from "@/lib/services/parent-links/parent-links";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("parent", "student");
  const link = await revokeLink((await ctx.params).id, user);
  return ok(link);
});
