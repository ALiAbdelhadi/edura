import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { updatePointsRule, deletePointsRule } from "@/lib/services/points/points-admin";

export const dynamic = "force-dynamic";


const patchSchema = z.object({
  pointsValue: z.number().int().min(-100000).max(100000).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updatePointsRule(id, body, user.id));
});

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await deletePointsRule(id, user.id));
});
