import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getAdminDashboard } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

/**
 * Center home counters. Opened to MANAGER (and the owner). A MANAGER is
 * operational-only: the financial fields (revenue / expenses / net-profit /
 * fee-defaulters / revenue-vs-expenses trend) are STRIPPED for a manager — only
 * the owner and the center_accountant (via the finance reports) see money.
 */
function stripFinancials(
  result: Awaited<ReturnType<typeof getAdminDashboard>>,
) {
  const { revenue: _r, expenses: _e, netProfit: _n, ...totals } = result.totals;
  const { revenueVsExpenses: _rve, ...analytics } = result.analytics;
  const { feeDefaulters: _fd, ...rest } = result;
  return { ...rest, totals, analytics };
}

export const GET = centerStaff(
  async (_req, _ctx, { acting: user, staffRole }) => {
    const result = await getAdminDashboard(user);
    return ok(staffRole === "manager" ? stripFinancials(result) : result);
  },
  { allow: MANAGER },
);
