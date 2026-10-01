import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { revokeAllSessions } from "@repo/server-core/backoffice/admin/admin-users";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withRole("super_admin", async (actor, req, ctx) => {
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await revokeAllSessions(actor, id, reason));
});
