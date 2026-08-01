import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { revokeOneSession } from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id, sessionId } = await ctx.params;
  return ok(await revokeOneSession(actor, id, sessionId));
});
