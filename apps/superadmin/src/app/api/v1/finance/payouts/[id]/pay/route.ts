import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { payPayout } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

// SECURITY_AUDIT.md M-03 — the second act. Same roles as approve; the service
// refuses the approver and the generator, so "same role" never means "same person".
const bodySchema = z.object({ externalRef: z.string().trim().min(3).max(120) });

export const POST = withRole(["accountant", "super_admin"], async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { externalRef } = await parseJson(req, bodySchema);
  return ok(await payPayout(id, { externalRef }, user));
});
