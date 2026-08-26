import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getTeacherWalletTransactions } from "@/lib/services/finance/teacher-wallet";

export const dynamic = "force-dynamic";
export const GET = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const sp = new URL(req.url).searchParams;
  const result = await getTeacherWalletTransactions(user, {
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
    // Cairo day strings; bound the list AND produce the server-side period
    // totals (the «كسبت الفترة دي» figure). Omitted = full history, no totals.
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  return ok(result.data, { meta: { nextCursor: result.nextCursor, totals: result.totals } });
});
