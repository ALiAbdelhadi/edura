import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { payoutStatusCounts } from "@repo/server-core/backoffice/finance/payouts";

export const GET = withRole(["accountant", "super_admin"], async () => {
  return ok(await payoutStatusCounts());
});
