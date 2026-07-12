import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { rejectPayout } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("accountant", "super_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await rejectPayout(id, reason, user));
});
