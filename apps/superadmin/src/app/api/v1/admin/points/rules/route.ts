import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listPointsRules, createPointsRule } from "@/lib/services/points/points-admin";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async () => {
  return ok(await listPointsRules());
});

const createSchema = z.object({
  eventName: z.string().trim().min(1).max(100),
  pointsValue: z.number().int().min(-100000).max(100000),
  isActive: z.boolean().optional(),
});

export const POST = withRole("super_admin", async (user, req) => {
  const body = await parseJson(req, createSchema);
  return ok(await createPointsRule(body, user.id), { status: 201 });
});
