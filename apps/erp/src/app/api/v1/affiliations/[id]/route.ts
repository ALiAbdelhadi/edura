import { delegated } from "@/lib/authz/teacher-actor";
import { scopedDb } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = delegated(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;

  const result = await scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findUnique({ where: { id } });
    if (!affiliation) throw new NotFoundError("Affiliation not found");
    if (affiliation.teacherId !== user.id) throw new ForbiddenError();

    const activeCourses = await tx.course.count({
      where: {
        centerId: affiliation.centerId,
        teacherId: user.id,
        status: "active",
      },
    });
    if (activeCourses > 0) {
      throw new BusinessRuleError("Cannot leave center while you have active courses");
    }

    await tx.centerTeacherAffiliation.update({
      where: { id },
      data: { status: "removed", removedAt: new Date(), respondedAt: new Date() },
    });

    return { left: true };
  });

  return ok(result);
});