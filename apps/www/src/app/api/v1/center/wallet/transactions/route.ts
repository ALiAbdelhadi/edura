import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getCenterWalletTransactions } from "@/lib/services/finance/center-wallet";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const url = new URL(req.url);
  return ok(
    await getCenterWalletTransactions(user, {
      take: url.searchParams.get("take") ? Number(url.searchParams.get("take")) : undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    }),
  );
});
