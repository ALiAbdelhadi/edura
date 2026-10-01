import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { revenueReport } from "@repo/server-core/backoffice/finance/finance-reports";

export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
  const p = new URL(req.url).searchParams.get("period");
  const period = p === "daily" || p === "yearly" ? p : "monthly";
  return ok(await revenueReport(period));
});
