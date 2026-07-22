import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { upsertRoomSplit, clearRoomSplit } from "@/lib/services/admin/rooms-split";

export const dynamic = "force-dynamic";

const splitSchema = z
  .object({
    platformShareBp: z.number().int().min(0).max(10000),
    teacherShareBp: z.number().int().min(0).max(10000),
    centerShareBp: z.number().int().min(0).max(10000),
  })
  .strict()
  .refine((s) => s.platformShareBp + s.teacherShareBp + s.centerShareBp === 10000, {
    message: "The three shares must sum to exactly 100% (10000 basis points)",
  });

/** super_admin ONLY — per-room revenue split override (most specific). */
export const PUT = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, roomId } = await ctx.params;
  const body = await parseJson(req, splitSchema);
  return ok(await upsertRoomSplit(id, roomId, body, user));
});

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, roomId } = await ctx.params;
  return ok(await clearRoomSplit(id, roomId, user));
});
