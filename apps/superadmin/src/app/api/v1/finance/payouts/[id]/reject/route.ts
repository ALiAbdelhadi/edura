import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { rejectPayout } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withRole(["accountant", "super_admin"], async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await rejectPayout(id, reason, user));
});
