import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
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

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, requestId } = await ctx.params;
  const { decision, note } = await parseJson(req, bodySchema);
  return ok(await adminDecideDeletionRequest(user, id, requestId, decision, note));
});
