import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { verifyStudentDateOfBirth } from "@/lib/services/admin/center-platform";

// CHILD SAFETY, not a profile edit. A student counts as a MINOR unless a
// VERIFIED date of birth shows 18+, and parent oversight of their conversations
// is active for every minor — so verifying an adult DOB switches that oversight
// OFF. Reason is mandatory: it records what evidence was seen.
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(1).max(500),
    centerId: z.uuid().optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { studentId } = await ctx.params;
  const { centerId, ...body } = await parseJson(req, bodySchema);
  return ok(await verifyStudentDateOfBirth(user, studentId, body, centerId ?? null));
});
