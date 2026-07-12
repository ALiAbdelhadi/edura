import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { approveLink } from "@/lib/services/parentLinks/parentLinks";

export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("parent", "student");
  const link = await approveLink((await ctx.params).id, user);
  return ok(link);
});
