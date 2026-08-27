import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminSettlementPreview } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, sessionId } = await ctx.params;
  return ok(await adminSettlementPreview(user, id, sessionId));
});
