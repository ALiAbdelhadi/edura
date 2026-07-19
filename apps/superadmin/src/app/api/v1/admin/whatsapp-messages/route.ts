import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listWhatsAppMessages } from "@/lib/services/admin/whatsapp-messages";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const sp = new URL(req.url).searchParams;
  const result = await listWhatsAppMessages({
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    template: sp.get("template") ?? undefined,
    page: sp.get("page") ?? undefined,
    limit: sp.get("limit") ?? sp.get("pageSize") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
