import { centerStaff, ACCOUNTANT } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getExpensesReport } from "@repo/server-core/services/reports/reports";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const result = await getExpensesReport(user, from, to);
    return ok(result);
  },
  { allow: ACCOUNTANT },
);
