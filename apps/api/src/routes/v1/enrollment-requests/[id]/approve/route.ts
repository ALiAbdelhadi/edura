import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { approveEnrollmentRequest } from "@repo/server-core/services/center/enrollments";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  return ok(await approveEnrollmentRequest(user, id));
});
