import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listUnconfirmedRefunds } from "@/lib/services/payments/refund-payment";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  return ok(await listUnconfirmedRefunds(user));
});
