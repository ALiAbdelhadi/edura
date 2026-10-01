import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { adminPostponeSession } from "@repo/server-core/backoffice/admin/center-operations";

const bodySchema = z
  .object({
    newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    newStartTime: z.string().regex(/^\d{2}:\d{2}$/),
    newEndTime: z.string().regex(/^\d{2}:\d{2}$/),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, sessionId } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminPostponeSession(user, id, sessionId, body));
});
