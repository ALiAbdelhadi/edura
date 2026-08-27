import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getAdminDashboard } from "@/lib/services/reports/reports";
import { parseProvenance } from "@/lib/http/provenance";

export const dynamic = "force-dynamic";

function stripFinancials(
  result: Awaited<ReturnType<typeof getAdminDashboard>>,
) {
  const { revenue: _r, expenses: _e, netProfit: _n, ...totals } = result.totals;
  const { revenueVsExpenses: _rve, ...analytics } = result.analytics;
  const { feeDefaulters: _fd, ...rest } = result;
  return { ...rest, totals, analytics };
}

function parsePeriod(url: URL): { from?: string; to?: string } {
  return {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };
}

export const GET = centerStaff(
  async (req, _ctx, { acting: user, staffRole }) => {
    const url = new URL(req.url);
    const result = await getAdminDashboard(user, parseProvenance(url), parsePeriod(url));
    return ok(staffRole === "manager" ? stripFinancials(result) : result);
  },
  { allow: MANAGER },
);
