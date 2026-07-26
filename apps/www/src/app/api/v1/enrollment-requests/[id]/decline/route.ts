import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { declineEnrollmentRequest } from "@repo/server-core/services/center/enrollments";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().optional(),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);
  return ok(await declineEnrollmentRequest(user, id, reason));
});
