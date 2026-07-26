import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminCreateWalkInSubscription } from "@/lib/services/admin/center-money";

// The classic Egyptian counter flow: cash for a session + check-in in one step.
// No amount field — the price is the server-side snapshot of the course's plan
// price, so a caller cannot name their own number.
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    studentId: z.uuid(),
    courseId: z.uuid(),
    plan: z.enum(["monthly", "per_session"]),
    sessionId: z.uuid().optional(),
    markAttendance: z.boolean().optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminCreateWalkInSubscription(user, id, body), { status: 201 });
});
