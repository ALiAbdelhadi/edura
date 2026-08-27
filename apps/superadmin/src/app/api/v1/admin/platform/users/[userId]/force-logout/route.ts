import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { forceLogoutUser } from "@/lib/services/admin/center-platform";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    centerId: z.uuid().optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { userId } = await ctx.params;
  const { reason, centerId } = await parseJson(req, bodySchema);
  return ok(await forceLogoutUser(user, userId, reason, centerId ?? null));
});
