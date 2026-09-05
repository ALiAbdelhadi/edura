import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { searchConversations } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const p = new URL(req.url).searchParams;
  const result = await searchConversations({
    q: p.get("q") ?? undefined,
    role: p.get("role") ?? undefined,
    centerId: p.get("centerId") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    minorsOnly: p.get("minorsOnly") ?? undefined,
    page: p.get("page") ?? undefined,
    limit: p.get("limit") ?? p.get("pageSize") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
