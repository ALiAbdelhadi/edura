import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { revenueReport } from "@/lib/services/finance/finance-reports";

export const dynamic = "force-dynamic";
export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const p = new URL(req.url).searchParams.get("period");
  const period = p === "daily" || p === "yearly" ? p : "monthly";
  return ok(await revenueReport(period));
});
