import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listParentWalletHistory } from "@/lib/services/wallet/parent-wallet";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("parent");
  const take = Number(new URL(req.url).searchParams.get("take") ?? 50);
  return ok(
    await listParentWalletHistory(user, { limit: Number.isFinite(take) ? take : 50 }),
  );
});
