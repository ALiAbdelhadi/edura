import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { rejectPayout } from "@repo/server-core/backoffice/finance/payouts";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withRole(["accountant", "super_admin"], async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await rejectPayout(id, reason, user));
});
