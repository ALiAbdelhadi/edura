import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { centerStatement } from "@repo/server-core/backoffice/finance/finance-reports";

export const GET = withRole(["accountant", "super_admin"], async (_user, req, ctx) => {
  const { centerId } = await ctx.params;
  const p = new URL(req.url).searchParams;
  return ok(await centerStatement(centerId, p.get("from") ?? undefined, p.get("to") ?? undefined));
});
