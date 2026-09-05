import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import {
  adminGetCenterWallet,
  adminListCenterPayouts,
  adminRequestCenterPayout,
} from "@/lib/services/admin/center-money";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    amount: moneySchema.positive().optional(),
    clientRequestId: z.string().min(8).max(64).optional(),
  })
  .strict();

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  const [wallet, payouts] = await Promise.all([
    adminGetCenterWallet(user, id),
    adminListCenterPayouts(user, id),
  ]);
  return ok({ wallet, payouts });
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { amount, clientRequestId } = await parseJson(req, bodySchema);
  return ok(await adminRequestCenterPayout(user, id, amount, clientRequestId), { status: 201 });
});
