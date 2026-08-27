import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listSessionSettlements } from "@/lib/services/admin/session-settlements";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
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
