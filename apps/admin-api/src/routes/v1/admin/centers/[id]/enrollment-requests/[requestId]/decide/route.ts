import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import {
  adminApproveEnrollmentRequest,
  adminDeclineEnrollmentRequest,
} from "@repo/server-core/backoffice/admin/center-academic";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z
  .object({
    decision: z.enum(["approve", "decline"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, requestId } = await ctx.params;
  const { decision, reason } = await parseJson(req, bodySchema);
  return ok(
    decision === "approve"
      ? await adminApproveEnrollmentRequest(user, id, requestId)
      : await adminDeclineEnrollmentRequest(user, id, requestId, reason),
  );
});
