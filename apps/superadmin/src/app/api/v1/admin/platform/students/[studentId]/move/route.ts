import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moveStudentBetweenCenters } from "@/lib/services/admin/center-platform";

export const dynamic = "force-dynamic";

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
