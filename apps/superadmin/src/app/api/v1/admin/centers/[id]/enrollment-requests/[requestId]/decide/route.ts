import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  adminApproveEnrollmentRequest,
  adminDeclineEnrollmentRequest,
} from "@/lib/services/admin/center-academic";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    decision: z.enum(["approve", "decline"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, requestId } = await ctx.params;
  const { decision, reason } = await parseJson(req, bodySchema);
  return ok(
    decision === "approve"
      ? await adminApproveEnrollmentRequest(user, id, requestId)
      : await adminDeclineEnrollmentRequest(user, id, requestId, reason),
  );
});
