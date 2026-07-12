import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { userGrowthChart } from "@/lib/services/admin/platformDashboard";

export const dynamic = "force-dynamic";

// PRD §4.2 GET /admin/dashboard/user-growth-chart
export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await userGrowthChart());
});
