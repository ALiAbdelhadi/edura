import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listPaymentIntents } from "@/lib/services/payments/payment-intents-admin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
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
