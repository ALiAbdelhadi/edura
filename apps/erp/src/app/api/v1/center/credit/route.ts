import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getCenterCredit } from "@/lib/services/wallet/center-credit-topup";

export const dynamic = "force-dynamic";

/** The center's platform-credit position + ledger (Phase 4, D4). Owner only —
 *  same posture as the wallet/withdraw surface. */
export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  return ok(await getCenterCredit(user));
});
