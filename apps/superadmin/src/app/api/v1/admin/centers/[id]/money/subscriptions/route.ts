import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminCreateWalkInSubscription } from "@/lib/services/admin/center-money";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

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
