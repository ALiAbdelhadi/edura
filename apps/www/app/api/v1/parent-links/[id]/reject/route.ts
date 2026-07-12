import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { rejectLink } from "@/lib/services/parentLinks/parentLinks";

export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("parent", "student");
  const link = await rejectLink((await ctx.params).id, user);
  return ok(link);
});
