import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("student");
  const { id } = await ctx.params;

  await scopedDb(user, async (tx) => {
    const request = await tx.enrollmentRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Request not found");
    if (request.studentId !== user.id) throw new ForbiddenError();
    if (request.status !== "pending") {
      throw new BusinessRuleError("Only pending requests can be cancelled");
    }

    await tx.enrollmentRequest.update({ where: { id }, data: { status: "cancelled" } });
  });

  return ok({ cancelled: true });
});
