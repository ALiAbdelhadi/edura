import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listUnconfirmedRefunds } from "@repo/server-core/services/payments/refund-payment";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  return ok(await listUnconfirmedRefunds(user));
});
