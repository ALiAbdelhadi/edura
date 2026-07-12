import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ teacherId: string }> };

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { teacherId } = await ctx.params;

  await scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: {
        centerId: user.centerId as string,
        teacherId,
        status: { in: ["pending", "active"] },
      },
    });
    if (!affiliation) throw new NotFoundError("Affiliation not found");

    const activeCourses = await tx.course.count({
      where: { centerId: user.centerId as string, teacherId, status: "active" },
    });
    if (activeCourses > 0) {
      throw new BusinessRuleError("Cannot remove teacher with active courses");
    }

    await tx.centerTeacherAffiliation.update({
      where: { id: affiliation.id },
      data: { status: "removed", removedAt: new Date() },
    });
  });

  return ok({ removed: true });
});
