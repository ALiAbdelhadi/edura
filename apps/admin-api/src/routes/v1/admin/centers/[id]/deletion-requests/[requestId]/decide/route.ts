import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminDecideDeletionRequest } from "@repo/server-core/backoffice/admin/center-operations";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, requestId } = await ctx.params;
  const { decision, note } = await parseJson(req, bodySchema);
  return ok(await adminDecideDeletionRequest(user, id, requestId, decision, note));
});
