import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { closeShift } from "@/lib/services/center/shifts";

export const dynamic = "force-dynamic";

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
