import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { revokeOneSession } from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

export const DELETE = withRole("super_admin", async (actor, _req, ctx) => {
  const { id, sessionId } = await ctx.params;
  return ok(await revokeOneSession(actor, id, sessionId));
});
