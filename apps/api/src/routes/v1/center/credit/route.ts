import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getCenterCredit } from "@repo/server-core/services/wallet/center-credit-topup";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  return ok(await getCenterCredit(user));
});
