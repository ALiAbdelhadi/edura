import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { upsertCenterM2Rate, clearCenterM2Rate } from "@repo/server-core/backoffice/admin/rooms-split";

const rateSchema = z
  .object({
    fee: z.number().int().min(0).max(99_999_900).nullable(),
    bp: z.number().int().min(0).max(10_000).nullable(),
  })
  .strict()
  .refine((r) => (r.fee != null) !== (r.bp != null), {
    message: "Set exactly one of fee (piasters/student) or bp (basis points/student)",
  });

export const PUT = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, rateSchema);
  return ok(await upsertCenterM2Rate(id, body, user));
});

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await clearCenterM2Rate(id, user));
});
