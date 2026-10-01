import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminLiftCenterBlacklist } from "@repo/server-core/backoffice/admin/center-operations";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

export const DELETE = withRole("super_admin", async (user, req, ctx) => {
  const { id, entryId } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await adminLiftCenterBlacklist(user, id, entryId, reason));
});
