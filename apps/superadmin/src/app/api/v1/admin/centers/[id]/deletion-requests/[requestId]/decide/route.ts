import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminDecideDeletionRequest } from "@/lib/services/admin/center-operations";

// Approving SOFT-deletes the account: the row and its financial history
// survive, and C-03 cuts the live session on the next request.
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
