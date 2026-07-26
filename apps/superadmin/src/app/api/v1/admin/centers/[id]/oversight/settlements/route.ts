import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { centerSettlements } from "@/lib/services/admin/center-oversight";

// Read-only center oversight. super_admin only; no write verb is exported.
export const dynamic = "force-dynamic";

export const GET = withErrors(async (req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await centerSettlements(id, q));
});
