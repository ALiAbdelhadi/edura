import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { listTransactions } from "@/lib/services/finance/accountant";

export const dynamic = "force-dynamic";

// Platform transaction ledger (PRD §4.3). Accountant + super_admin.
export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const p = new URL(req.url).searchParams;
  const result = await listTransactions({
    type: p.get("type") ?? undefined,
    status: p.get("status") ?? undefined,
    centerId: p.get("centerId") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    page: p.get("page") ?? undefined,
    limit: p.get("limit") ?? undefined,
  });
  return ok(result.items, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
