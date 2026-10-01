import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { getUnreadCounts } from "@repo/server-core/services/messages/messages";

export const GET = withErrors(async () => {
  const user = await requireSession();
  return ok(await getUnreadCounts(user));
});
