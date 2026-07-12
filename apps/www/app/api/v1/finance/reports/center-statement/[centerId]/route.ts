import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { centerStatement } from "@/lib/services/finance/financeReports";

export const dynamic = "force-dynamic";
// PRD §4.3 GET /finance/reports/center-statement/:center_id?from=&to=
export const GET = withErrors(async (req, ctx) => {
  await requireRole("accountant", "super_admin");
  const { centerId } = await ctx.params;
  const p = new URL(req.url).searchParams;
  return ok(await centerStatement(centerId, p.get("from") ?? undefined, p.get("to") ?? undefined));
});
