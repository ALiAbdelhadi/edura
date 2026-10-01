import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { revokeOneSession } from "@repo/server-core/backoffice/admin/admin-users";

export const DELETE = withRole("super_admin", async (actor, _req, ctx) => {
  const { id, sessionId } = await ctx.params;
  return ok(await revokeOneSession(actor, id, sessionId));
});
