import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/backoffice-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { markBackofficeNotificationRead } from "@repo/server-core/backoffice/notifications/inbox";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;

  const notification = await markBackofficeNotificationRead(user, id);

  return ok(notification);
});
