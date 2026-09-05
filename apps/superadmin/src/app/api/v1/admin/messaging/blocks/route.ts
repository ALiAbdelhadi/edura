import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listBlocks } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const p = new URL(req.url).searchParams;
  const result = await listBlocks({
    page: p.get("page") ?? undefined,
    limit: p.get("limit") ?? p.get("pageSize") ?? undefined,
    all: p.get("all") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
