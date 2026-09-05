import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { revenueReport } from "@/lib/services/finance/finance-reports";

export const dynamic = "force-dynamic";
export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
  const p = new URL(req.url).searchParams.get("period");
  const period = p === "daily" || p === "yearly" ? p : "monthly";
  return ok(await revenueReport(period));
});
