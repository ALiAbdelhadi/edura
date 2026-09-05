import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import {
  adminApproveEnrollmentRequest,
  adminDeclineEnrollmentRequest,
} from "@/lib/services/admin/center-academic";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
