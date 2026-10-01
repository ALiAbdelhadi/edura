import { requireSession } from "@repo/server-core/erp-auth/session";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { withdrawAccountDeletion } from "@repo/server-core/services/data-rights/account-deletion";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;
  return ok(await withdrawAccountDeletion(user, id));
});
