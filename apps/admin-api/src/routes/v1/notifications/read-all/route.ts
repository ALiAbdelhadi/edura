import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/backoffice-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { markAllNotificationsRead } from "@repo/server-core/backoffice/notifications/inbox";

export const POST = withErrors(async () => {
  const user = await requireSession();

  const updated = await markAllNotificationsRead(user);

  return ok({ updated });
});
