import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { startOfTodayUTC } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  teacherId: z.string().min(1),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const { teacherId } = await parseJson(req, bodySchema);

  await scopedDb(user, async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(user, course.centerId);

    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId: user.centerId as string, teacherId, status: "active" },
    });
    if (!affiliation) {
      throw new BusinessRuleError("Teacher does not have an active affiliation with this center");
    }

    await tx.course.update({ where: { id }, data: { teacherId } });

    await tx.session.updateMany({
      where: {
        courseId: id,
        date: { gte: startOfTodayUTC() },
        status: { in: ["scheduled", "postponed"] },
      },
      data: { teacherId },
    });
  });

  return ok({ reassigned: true, teacherId });
});
