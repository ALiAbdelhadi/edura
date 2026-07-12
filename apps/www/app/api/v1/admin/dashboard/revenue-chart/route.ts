import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { revenueChart } from "@/lib/services/admin/platformDashboard";

export const dynamic = "force-dynamic";

// PRD §4.2 GET /admin/dashboard/revenue-chart?period=weekly|monthly
export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const period = new URL(req.url).searchParams.get("period") === "weekly" ? "weekly" : "monthly";
  return ok(await revenueChart(period));
});
