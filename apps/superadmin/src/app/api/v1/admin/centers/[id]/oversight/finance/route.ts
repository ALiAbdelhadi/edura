import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { centerFinanceSummary } from "@/lib/services/admin/center-oversight";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await centerFinanceSummary(id, q));
});
