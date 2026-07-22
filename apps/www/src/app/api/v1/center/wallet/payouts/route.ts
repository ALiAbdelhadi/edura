import { centerStaff, ACCOUNTANT } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { listCenterPayouts } from "@/lib/services/finance/center-wallet";

export const dynamic = "force-dynamic";

// READ center payout history — owner + center_accountant (read-only).
export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => {
    return ok(await listCenterPayouts(user));
  },
  { allow: ACCOUNTANT },
);
