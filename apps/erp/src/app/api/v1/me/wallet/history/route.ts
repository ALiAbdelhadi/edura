import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listWalletHistory } from "@/lib/services/wallet/wallet";

export const dynamic = "force-dynamic";

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
