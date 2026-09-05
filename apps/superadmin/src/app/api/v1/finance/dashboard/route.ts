import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { financeDashboard } from "@/lib/services/finance/accountant";

export const dynamic = "force-dynamic";

export const GET = withRole(["accountant", "super_admin"], async () => {
  return ok(await financeDashboard());
});
