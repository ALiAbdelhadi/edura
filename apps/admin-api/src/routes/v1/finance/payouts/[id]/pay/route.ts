import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { payPayout } from "@repo/server-core/backoffice/finance/payouts";

// SECURITY_AUDIT.md M-03 — the second act. Same roles as approve; the service
// refuses the approver and the generator, so "same role" never means "same person".
const bodySchema = z.object({ externalRef: z.string().trim().min(3).max(120) });

export const POST = withRole(["accountant", "super_admin"], async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { externalRef } = await parseJson(req, bodySchema);
  return ok(await payPayout(id, { externalRef }, user));
});
