import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { financeAlerts } from "@/lib/services/finance/finance-reports";

export const dynamic = "force-dynamic";
export const GET = withRole(["accountant", "super_admin"], async () => {
  return ok(await financeAlerts());
});
