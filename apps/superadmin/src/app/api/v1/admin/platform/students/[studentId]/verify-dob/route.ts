import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { verifyStudentDateOfBirth } from "@/lib/services/admin/center-platform";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(1).max(500),
    centerId: z.uuid().optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { studentId } = await ctx.params;
  const { centerId, ...body } = await parseJson(req, bodySchema);
  return ok(await verifyStudentDateOfBirth(user, studentId, body, centerId ?? null));
});
