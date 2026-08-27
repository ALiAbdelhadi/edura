import { requireSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withdrawAccountDeletion } from "@repo/server-core/services/data-rights/account-deletion";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;
  return ok(await withdrawAccountDeletion(user, id));
});
