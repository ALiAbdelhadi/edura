import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listParentWalletHistory } from "@repo/server-core/services/wallet/parent-wallet-facade";

export const GET = withErrors(async (req) => {
  const user = await requireRole("parent");
  const take = Number(new URL(req.url).searchParams.get("take") ?? 50);
  return ok(
    await listParentWalletHistory(user, { limit: Number.isFinite(take) ? take : 50 }),
  );
});
