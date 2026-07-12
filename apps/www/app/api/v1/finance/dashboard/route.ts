import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { financeDashboard } from "@/lib/services/finance/accountant";

export const dynamic = "force-dynamic";

// Platform finance KPIs (PRD §4.3). Accountant + super_admin.
export const GET = withErrors(async () => {
  await requireRole("accountant", "super_admin");
  return ok(await financeDashboard());
});
