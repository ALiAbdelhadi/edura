import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { moveStudentBetweenCenters } from "@repo/server-core/backoffice/admin/center-platform";

const bodySchema = z
  .object({
    fromCenterId: z.uuid(),
    toCenterId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { studentId } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await moveStudentBetweenCenters(user, { studentId, ...body }));
});
