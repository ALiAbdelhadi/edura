import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listSubscriptions } from "@repo/server-core/backoffice/subscriptions/subscriptions-admin";

export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
  const p = new URL(req.url).searchParams;
  const result = await listSubscriptions({
    q: p.get("q") ?? undefined,
    status: p.get("status") ?? undefined,
    plan: p.get("plan") ?? undefined,
    source: p.get("source") ?? undefined,
    targetType: p.get("targetType") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    page: p.get("page") ?? undefined,
    limit: p.get("limit") ?? p.get("pageSize") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
