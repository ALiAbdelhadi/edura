import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getAdminDashboard } from "@/lib/services/reports/reports";
import { parseProvenance } from "@/lib/http/provenance";

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

/**
 * `from` / `to` narrow every money and attendance figure to a period.
 *
 * They were absent, so `revenue` and `attendanceRate` were lifetime totals
 * wearing present-tense names (CENTER_IA_AUDIT.md §7.1 finding 3). OMITTING
 * THEM STILL MEANS LIFETIME — the pre-existing behaviour, unchanged — but the
 * response now carries a `period` saying so, rather than leaving the reader to
 * infer it from a missing parameter.
 *
 * Passed through as the raw strings the service resolves through `dayRange`, so
 * this screen and the reports beneath it bound a day the same way.
 */
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
