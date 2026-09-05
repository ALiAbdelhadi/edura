import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listStudents } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

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
