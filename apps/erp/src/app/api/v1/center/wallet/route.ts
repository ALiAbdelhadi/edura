import { centerStaff, ACCOUNTANT } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { getCenterWallet } from "@/lib/services/finance/center-wallet";

export const dynamic = "force-dynamic";

// READ the center wallet balance — owner + center_accountant. WITHDRAWING
// (payout-request) is a HARD EXCLUSION, owner-only by omission.
export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => {
    return ok(await getCenterWallet(user));
  },
  { allow: ACCOUNTANT },
);
