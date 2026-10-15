import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listCenters } from "@repo/server-core/backoffice/admin/platform";

export const GET = withRole("super_admin", async (_user, req) => {
  const sp = new URL(req.url).searchParams;
  const result = await listCenters({
    status: sp.get("status") ?? undefined,
    q: sp.get("q") ?? undefined,
    page: sp.get("page") ?? undefined,
    limit: sp.get("limit") ?? sp.get("pageSize") ?? sp.get("take") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
