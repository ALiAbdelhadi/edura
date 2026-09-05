import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listPaymentIntents } from "@/lib/services/payments/payment-intents-admin";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const p = new URL(req.url).searchParams;
  const result = await listPaymentIntents({
    q: p.get("q") ?? undefined,
    status: p.get("status") ?? undefined,
    gateway: p.get("gateway") ?? undefined,
    method: p.get("method") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    page: p.get("page") ?? undefined,
    limit: p.get("limit") ?? p.get("pageSize") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});
