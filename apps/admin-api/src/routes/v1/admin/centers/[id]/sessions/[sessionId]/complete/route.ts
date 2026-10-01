import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminCompleteSession } from "@repo/server-core/backoffice/admin/center-operations";

export const POST = withRole("super_admin", async (user, _req, ctx) => {
  const { id, sessionId } = await ctx.params;
  return ok(await adminCompleteSession(user, id, sessionId));
});
