import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { revenueReport } from "@/lib/services/finance/financeReports";

export const dynamic = "force-dynamic";
// PRD §4.3 GET /finance/reports/revenue?period=daily|monthly|yearly
export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const p = new URL(req.url).searchParams.get("period");
  const period = p === "daily" || p === "yearly" ? p : "monthly";
  return ok(await revenueReport(period));
});
