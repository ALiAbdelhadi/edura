import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { cancelEnrollmentRequest } from "@repo/server-core/services/enrollments/requests";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("student");
  const { id } = await ctx.params;

  await cancelEnrollmentRequest(user, id);

  return ok({ cancelled: true });
});
