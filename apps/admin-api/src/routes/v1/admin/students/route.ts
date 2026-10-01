import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listStudents } from "@repo/server-core/backoffice/admin/platform";

export const GET = withRole("super_admin", async (_user, req) => {
  const sp = new URL(req.url).searchParams;
  const { data, total, page, limit } = await listStudents({
    grade: sp.get("grade") ?? undefined,
    centerId: sp.get("center_id") ?? undefined,
    q: sp.get("q") ?? undefined,
    page: sp.get("page") ?? undefined,
    limit: sp.get("limit") ?? undefined,
  });
  return ok(data, { meta: { total, page, limit } });
});
