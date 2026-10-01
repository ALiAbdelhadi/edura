import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listWalletHistory } from "@repo/server-core/services/wallet/wallet-facade";

export const GET = withErrors(async (req) => {
  const user = await requireRole("student", "parent");
  const params = new URL(req.url).searchParams;
  const take = Number(params.get("take") ?? 50);
  return ok(
    await listWalletHistory(user, {
      limit: Number.isFinite(take) ? take : 50,
      studentId: params.get("studentId") ?? undefined,
    }),
  );
});
