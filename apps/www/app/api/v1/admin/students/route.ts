import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { listStudents } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

// PRD §4.2 GET /admin/students?grade=&center_id=
export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const sp = new URL(req.url).searchParams;
  const result = await listStudents({
    grade: sp.get("grade") ?? undefined,
    centerId: sp.get("center_id") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
  });
  return ok(result.data, { meta: { nextCursor: result.nextCursor } });
});
