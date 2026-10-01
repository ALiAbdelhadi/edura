import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { financeDashboard } from "@repo/server-core/backoffice/finance/accountant";

export const GET = withRole(["accountant", "super_admin"], async () => {
  return ok(await financeDashboard());
});
