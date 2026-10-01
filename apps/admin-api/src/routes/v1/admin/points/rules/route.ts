import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { listPointsRules, createPointsRule } from "@repo/server-core/backoffice/points/points-admin";

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
