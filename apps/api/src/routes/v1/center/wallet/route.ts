import { centerStaff, ACCOUNTANT } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getCenterWallet } from "@repo/server-core/services/finance/center-wallet";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => {
    return ok(await getCenterWallet(user));
  },
  { allow: ACCOUNTANT },
);
