import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import {
  adminGetCenterWallet,
  adminListCenterPayouts,
  adminRequestCenterPayout,
} from "@/lib/services/admin/center-money";

// Raises a PENDING payout. It pays nothing: approval and settlement stay in the
// accountant's finance surface, where the H1 row lock and the H2 balance floor
// live.
export const dynamic = "force-dynamic";

const bodySchema = z.object({ amount: moneySchema.positive().optional() }).strict();

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const [wallet, payouts] = await Promise.all([
    adminGetCenterWallet(user, id),
    adminListCenterPayouts(user, id),
  ]);
  return ok({ wallet, payouts });
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { amount } = await parseJson(req, bodySchema);
  return ok(await adminRequestCenterPayout(user, id, amount), { status: 201 });
});
