import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { updatePointsRule, deletePointsRule } from "@/lib/services/points/points-admin";

export const dynamic = "force-dynamic";


const patchSchema = z.object({
  pointsValue: z.number().int().min(-100000).max(100000).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withErrors(async (req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updatePointsRule(id, body));
});

export const DELETE = withErrors(async (_req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await deletePointsRule(id));
});
