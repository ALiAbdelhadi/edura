import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listSessionSettlements } from "@repo/server-core/backoffice/admin/session-settlements";

export const GET = withRole("super_admin", async (_user, req) => {
  const p = new URL(req.url).searchParams;
  const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const date = (v: string | null) => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  return ok(
    await listSessionSettlements({
      centerId: p.get("centerId") ?? undefined,
      pricingMethod: p.get("pricingMethod") ?? undefined,
      from: date(p.get("from")),
      to: date(p.get("to")),
      page: num(p.get("page")),
      limit: num(p.get("limit")),
    }),
  );
});
