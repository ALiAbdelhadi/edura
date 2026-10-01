import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { adjustStudentPoints } from "@repo/server-core/backoffice/points/points-admin";

const bodySchema = z.object({
  delta: z.number().int(),
  reason: z.string().trim().min(1).max(500),
  internalNote: z.string().trim().max(500).optional(),
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adjustStudentPoints(id, body, user.id));
});
