import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { financeAlerts } from "@/lib/services/finance/financeReports";

export const dynamic = "force-dynamic";
// PRD §4.3 GET /finance/alerts
export const GET = withErrors(async () => {
  await requireRole("accountant", "super_admin");
  return ok(await financeAlerts());
});
