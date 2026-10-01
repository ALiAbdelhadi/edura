import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import {
  adminGetCenterWallet,
  adminListCenterPayouts,
  adminRequestCenterPayout,
} from "@repo/server-core/backoffice/admin/center-money";
import { parseJson } from "@repo/server-core/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { z } from "zod";

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
