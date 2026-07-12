import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { refundsReport } from "@/lib/services/finance/financeReports";

export const dynamic = "force-dynamic";
// PRD §4.3 GET /finance/reports/refunds?from=&to=
export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const p = new URL(req.url).searchParams;
  return ok(await refundsReport(p.get("from") ?? undefined, p.get("to") ?? undefined));
});
