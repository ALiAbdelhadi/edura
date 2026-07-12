import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getTeacherWalletTransactions } from "@/lib/services/finance/teacherWallet";

export const dynamic = "force-dynamic";
// PRD §4.5 GET /teacher/wallet/transactions
export const GET = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const sp = new URL(req.url).searchParams;
  const result = await getTeacherWalletTransactions(user, {
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
  });
  return ok(result.data, { meta: { nextCursor: result.nextCursor } });
});
