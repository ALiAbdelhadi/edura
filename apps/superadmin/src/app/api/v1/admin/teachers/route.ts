import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listTeachers } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const sp = new URL(req.url).searchParams;
  const result = await listTeachers({
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    mode: sp.get("mode") ?? undefined,
    page: sp.get("page") ?? undefined,
    limit: sp.get("limit") ?? sp.get("pageSize") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
