import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminSettlementPreview } from "@/lib/services/admin/center-operations";

// Read-only: what completing this session WOULD distribute, at the course's
// frozen rates. Writes nothing and settles nothing.
export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, sessionId } = await ctx.params;
  return ok(await adminSettlementPreview(user, id, sessionId));
});
