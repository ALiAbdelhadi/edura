import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listPointsRules, createPointsRule } from "@/lib/services/points/pointsAdmin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await listPointsRules());
});

const createSchema = z.object({
  eventName: z.string().trim().min(1).max(100),
  pointsValue: z.number().int().min(-100000).max(100000),
  isActive: z.boolean().optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("super_admin");
  const body = await parseJson(req, createSchema);
  return ok(await createPointsRule(body, user.id), { status: 201 });
});
