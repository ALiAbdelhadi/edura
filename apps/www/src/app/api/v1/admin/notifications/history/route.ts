import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { notificationsHistory } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const sp = new URL(req.url).searchParams;
  const result = await notificationsHistory({
    type: sp.get("type") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
  });
  return ok(result.data, { meta: { nextCursor: result.nextCursor } });
});
