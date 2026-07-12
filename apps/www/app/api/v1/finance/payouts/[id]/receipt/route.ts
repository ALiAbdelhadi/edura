import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getPayoutReceipt } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_req, ctx) => {
  await requireRole("accountant", "super_admin");
  const { id } = await ctx.params;
  return ok(await getPayoutReceipt(id));
});
