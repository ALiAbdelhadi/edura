import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminPostponeSession } from "@/lib/services/admin/center-operations";

// Refused once the session has settled — moving it would detach a distributed
// settlement from its date.
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    newStartTime: z.string().regex(/^\d{2}:\d{2}$/),
    newEndTime: z.string().regex(/^\d{2}:\d{2}$/),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, sessionId } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminPostponeSession(user, id, sessionId, body));
});
