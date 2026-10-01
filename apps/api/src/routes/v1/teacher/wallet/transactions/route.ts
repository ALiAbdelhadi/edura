import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getTeacherWalletTransactions } from "@repo/server-core/services/finance/teacher-wallet";

export const GET = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const sp = new URL(req.url).searchParams;
  const result = await getTeacherWalletTransactions(user, {
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  return ok(result.data, { meta: { nextCursor: result.nextCursor, totals: result.totals } });
});
