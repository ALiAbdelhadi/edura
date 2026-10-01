import { centerStaff, ACCOUNTANT } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getCenterWalletTransactions } from "@repo/server-core/services/finance/center-wallet";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
    return ok(
      await getCenterWalletTransactions(user, {
        take: url.searchParams.get("take") ? Number(url.searchParams.get("take")) : undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
      }),
    );
  },
  { allow: ACCOUNTANT },
);
