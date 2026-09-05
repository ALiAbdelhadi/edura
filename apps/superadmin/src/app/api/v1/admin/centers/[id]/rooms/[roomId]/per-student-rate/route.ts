import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { upsertRoomM2Rate, clearRoomM2Rate } from "@/lib/services/admin/rooms-split";

export const dynamic = "force-dynamic";

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
  const { id, roomId } = await ctx.params;
  const body = await parseJson(req, rateSchema);
  return ok(await upsertRoomM2Rate(id, roomId, body, user));
});

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, roomId } = await ctx.params;
  return ok(await clearRoomM2Rate(id, roomId, user));
});
