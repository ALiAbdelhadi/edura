import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  getCenterSplit,
  upsertCenterSplit,
  clearCenterSplit,
} from "@/lib/services/admin/rooms-split";

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

export const GET = withRole("super_admin", async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getCenterSplit(id));
});

export const PUT = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, splitSchema);
  return ok(await upsertCenterSplit(id, body, user));
});

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await clearCenterSplit(id, user));
});
