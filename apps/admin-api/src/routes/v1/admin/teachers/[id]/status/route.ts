import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { setTeacherStatus } from "@repo/server-core/backoffice/admin/teacher-control";

// Same body as POST /admin/centers/[id]/status so one `ControlAction` drives
// both detail screens. The service delegates to `setUserSuspended` -- this is a
// second door onto the one suspension mechanism, not a second mechanism.
const schema = z
  .object({
    action: z.enum(["activate", "deactivate"]),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { action, reason } = await parseJson(req, schema);
  return ok(await setTeacherStatus(id, action, reason, user));
});
