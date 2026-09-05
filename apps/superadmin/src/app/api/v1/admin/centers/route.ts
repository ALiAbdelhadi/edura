import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listCenters } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const sp = new URL(req.url).searchParams;
  const result = await listCenters({
    status: sp.get("status") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
  });
  return ok(result.data, { meta: { nextCursor: result.nextCursor } });
});
