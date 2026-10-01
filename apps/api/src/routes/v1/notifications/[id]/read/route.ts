import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { markNotificationRead } from "@repo/server-core/services/notifications/inbox";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;

  const notification = await markNotificationRead(user, id);

  return ok(notification);
});
