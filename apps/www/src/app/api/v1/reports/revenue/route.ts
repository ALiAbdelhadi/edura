import { centerStaff, ACCOUNTANT } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getRevenueReport } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

// Financial report — read-only: owner + center_accountant. NOT a manager.
export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const result = await getRevenueReport(user, from, to);
    return ok(result);
  },
  { allow: ACCOUNTANT },
);
