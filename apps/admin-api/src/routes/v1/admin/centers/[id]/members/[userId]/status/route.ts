import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { setCenterMemberStatus } from "@repo/server-core/backoffice/admin/center-control";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const schema = z
  .object({
    kind: z.enum(["teacher", "student"]),
    action: z.enum(["activate", "deactivate"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, userId } = await ctx.params;
  const { kind, action, reason } = await parseJson(req, schema);
  return ok(await setCenterMemberStatus(id, userId, kind, action, reason, user));
});
