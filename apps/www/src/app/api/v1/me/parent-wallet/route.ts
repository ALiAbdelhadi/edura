import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getWalletForParent } from "@/lib/services/wallet/parent-wallet";

export const dynamic = "force-dynamic";

/** The parent's OWN balance — never a child's. Mirrors me/wallet. */
export const GET = withErrors(async () => {
  const user = await requireRole("parent");
  return ok(await getWalletForParent(user));
});
