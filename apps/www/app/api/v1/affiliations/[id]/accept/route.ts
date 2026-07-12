import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, ForbiddenError, ExpiredError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("teacher");
  const { id } = await ctx.params;

  const updated = await scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findUnique({ where: { id } });
    if (!affiliation) throw new NotFoundError("Affiliation not found");
    if (affiliation.teacherId !== user.id) throw new ForbiddenError();
    if (affiliation.status !== "pending") {
      throw new BusinessRuleError(`Affiliation is already ${affiliation.status}`);
    }
    if (affiliation.expiresAt < new Date()) {
      await tx.centerTeacherAffiliation.update({
        where: { id },
        data: { status: "expired" },
      });
      throw new ExpiredError("Invitation has expired");
    }

    return tx.centerTeacherAffiliation.update({
      where: { id },
      data: { status: "active", respondedAt: new Date() },
    });
  });

  return ok({ accepted: true, ...updated });
});
