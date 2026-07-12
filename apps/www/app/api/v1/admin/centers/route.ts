import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { listCenters } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

// PRD §4.2 GET /admin/centers?status=pending|active|rejected|blacklisted
export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const sp = new URL(req.url).searchParams;
  const result = await listCenters({
    status: sp.get("status") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
  });
  return ok(result.data, { meta: { nextCursor: result.nextCursor } });
});
