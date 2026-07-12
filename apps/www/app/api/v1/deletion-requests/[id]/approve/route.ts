import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { requireCenterScope } from "@/lib/authz/requireCenterScope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;

  const request = await scopedDb(user, async (tx) => {
    const existing = await tx.deletionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Deletion request not found");
    requireCenterScope(user, existing.centerId);
    if (existing.status !== "pending") {
      throw new BusinessRuleError(`Request already ${existing.status}`);
    }

    const updated = await tx.deletionRequest.update({
      where: { id },
      data: {
        status: "approved",
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    });

    await tx.user.updateMany({
      where: { id: existing.userId },
      data: { status: "deleted", deletedAt: new Date() },
    });

    return updated;
  });

  return ok(request);
});
