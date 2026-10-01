import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { approveLink } from "@repo/server-core/services/parent-links/parent-links";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("parent", "student");
  const link = await approveLink((await ctx.params).id, user);
  return ok(link);
});
