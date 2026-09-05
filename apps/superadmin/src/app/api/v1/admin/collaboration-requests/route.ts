import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listCollaborationRequests } from "@/lib/services/collaboration/collaboration-admin";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const p = new URL(req.url).searchParams;
  const result = await listCollaborationRequests({
    q: p.get("q") ?? undefined,
    status: p.get("status") ?? undefined,
    initiator: p.get("initiator") ?? undefined,
    page: p.get("page") ?? undefined,
    limit: p.get("limit") ?? p.get("pageSize") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
