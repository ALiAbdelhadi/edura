import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listTransactions } from "@repo/server-core/backoffice/finance/accountant";

export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
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
