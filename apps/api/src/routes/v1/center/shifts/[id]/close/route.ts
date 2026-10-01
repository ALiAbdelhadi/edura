import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { closeShift } from "@repo/server-core/services/center/shifts";

const closeSchema = z
  .object({ countedCash: z.number().int().min(0), note: z.string().max(500).optional() })
  .strict();

export const POST = centerStaff(
  async (req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    const body = await parseJson(req, closeSchema);
    return ok(await closeShift(user, id, body));
  },
  { allow: RECEPTION },
);
