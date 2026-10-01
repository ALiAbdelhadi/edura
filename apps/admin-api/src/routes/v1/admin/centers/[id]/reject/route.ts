import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { rejectCenter } from "@repo/server-core/backoffice/admin/platform";

const schema = z.object({ reason: z.string().trim().min(1).max(500) });

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, schema);
  return ok(await rejectCenter(id, reason, user.id));
});
