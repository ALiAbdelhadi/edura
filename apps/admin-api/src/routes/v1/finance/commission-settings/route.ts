import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getGlobalCommission } from "@repo/server-core/backoffice/settings/commission-admin";

export const GET = withRole(["accountant", "super_admin"], async () => {
  return ok(await getGlobalCommission());
});
