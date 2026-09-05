import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminDecideDeletionRequest } from "@/lib/services/admin/center-operations";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
