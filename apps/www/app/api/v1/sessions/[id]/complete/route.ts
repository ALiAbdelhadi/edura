import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { completeSession } from "@/lib/services/finance/distribution";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Mark a session completed and run the money-distribution engine (PRD §5.1).
// The session's teacher or a center_admin of its center may complete it.
export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("teacher", "center_admin");
  const { id } = await ctx.params;
  const result = await completeSession(id, user);
  return ok(result);
});
