import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { adminCancelSession } from "@repo/server-core/backoffice/admin/center-operations";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, sessionId } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await adminCancelSession(user, id, sessionId, reason));
});
