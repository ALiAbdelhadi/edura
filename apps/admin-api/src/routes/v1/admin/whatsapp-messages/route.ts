import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listWhatsAppMessages } from "@repo/server-core/backoffice/admin/whatsapp-messages";

export const GET = withRole("super_admin", async (_user, req) => {
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
