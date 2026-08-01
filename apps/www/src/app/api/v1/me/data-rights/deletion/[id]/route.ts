import { requireSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withdrawAccountDeletion } from "@repo/server-core/services/data-rights/account-deletion";

export const dynamic = "force-dynamic";

/**
 * Withdraw a request still under review.
 *
 * DELETE on a deletion request reads oddly for a second, and is right: the
 * resource being removed is the REQUEST, not the account. The service records
 * it as `cancelled` rather than `rejected` — see its header for why those must
 * not be the same status.
 */
export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;
  return ok(await withdrawAccountDeletion(user, id));
});
