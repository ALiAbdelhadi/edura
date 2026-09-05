import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { updateCenterRoom } from "@/lib/services/admin/rooms-split";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    capacity: z.number().int().positive().nullable().optional(),
    price: z.number().int().nonnegative().nullable().optional(),
    facilities: z.array(z.string().trim().min(1)).max(30).optional(),
    photos: z.array(z.string().url()).max(12).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    allowedPricingMethods: z
      .array(z.enum(["whole_room_percent", "per_attending_student"]))
      .min(1)
      .max(2)
      .refine((m) => new Set(m).size === m.length, "Duplicate pricing method")
      .optional(),
  })
  .strict();

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id, roomId } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updateCenterRoom(id, roomId, body, user));
});
