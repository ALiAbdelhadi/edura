import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { setCenterStatus } from "@repo/server-core/backoffice/admin/center-control";

const schema = z
  .object({
    action: z.enum(["activate", "deactivate"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { action, reason } = await parseJson(req, schema);
  return ok(await setCenterStatus(id, action, reason, user));
});
