import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { forceLogoutUser } from "@repo/server-core/backoffice/admin/center-platform";

const bodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    centerId: z.uuid().optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { userId } = await ctx.params;
  const { reason, centerId } = await parseJson(req, bodySchema);
  return ok(await forceLogoutUser(user, userId, reason, centerId ?? null));
});
