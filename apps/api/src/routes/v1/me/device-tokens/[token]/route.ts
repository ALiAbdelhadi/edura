import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { unregisterDeviceToken } from "@repo/server-core/services/notifications/push-registration";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { token } = await ctx.params;

  await unregisterDeviceToken(user, token);
  return ok({ unregistered: true });
});
