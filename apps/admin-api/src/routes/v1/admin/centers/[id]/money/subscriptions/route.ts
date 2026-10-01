import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminCreateWalkInSubscription } from "@repo/server-core/backoffice/admin/center-money";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z
  .object({
    studentId: z.uuid(),
    courseId: z.uuid(),
    plan: z.enum(["monthly", "per_session"]),
    sessionId: z.uuid().optional(),
    markAttendance: z.boolean().optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminCreateWalkInSubscription(user, id, body), { status: 201 });
});
