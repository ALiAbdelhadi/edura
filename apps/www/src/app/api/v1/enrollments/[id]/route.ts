import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;

  await scopedDb(user, async (tx) => {
    const enrollment = await tx.enrollment.findUnique({ where: { id } });
    if (!enrollment || enrollment.status !== "active") throw new NotFoundError("Enrollment not found");
    requireCenterScope(user, enrollment.centerId);

    await tx.enrollment.update({
      where: { id },
      data: { status: "unenrolled", unenrolledAt: new Date() },
    });
  });

  return ok({ unenrolled: true });
});
