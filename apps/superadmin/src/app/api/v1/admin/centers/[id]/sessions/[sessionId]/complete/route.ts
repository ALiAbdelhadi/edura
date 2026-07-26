import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminCompleteSession } from "@/lib/services/admin/center-operations";

// THE settlement trigger. This runs distributeSessionRevenue and writes the
// ledger — the SAME sanctioned flow a teacher's own "complete" runs, at the
// course's frozen rates, exactly once by construction. It is not a ledger edit,
// and it is refused outright on an already-settled session. Preview first via
// …/settlement-preview.
export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, sessionId } = await ctx.params;
  return ok(await adminCompleteSession(user, id, sessionId));
});
