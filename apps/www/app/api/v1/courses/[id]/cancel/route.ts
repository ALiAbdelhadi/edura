import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { requireCenterScope } from "@/lib/authz/requireCenterScope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { startOfTodayUTC } from "@/lib/validation/common";
import { notify } from "@/lib/services/notifications/notify";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().min(1),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);

  const { recipients, courseTitle } = await scopedDb(user, async (tx) => {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundError("Course not found");
    requireCenterScope(user, course.centerId);
    if (course.status === "cancelled") throw new BusinessRuleError("Course already cancelled");

    const now = new Date();

    // Cancel all future non-completed sessions (from start of today UTC, since
    // sessions are stored at UTC midnight — otherwise today's are skipped).
    await tx.session.updateMany({
      where: {
        courseId: id,
        date: { gte: startOfTodayUTC() },
        status: { in: ["scheduled", "postponed"] },
      },
      data: {
        status: "cancelled",
        cancellationReason: reason,
        editedAt: now,
      },
    });

    await tx.course.update({ where: { id }, data: { status: "cancelled" } });

    // Notify enrolled students + all center admins
    const enrollments = await tx.enrollment.findMany({
      where: { courseId: id, status: "active" },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    const adminProfiles = await tx.centerAdminProfile.findMany({
      where: { centerId: user.centerId as string },
      select: { userId: true },
    });
    const adminIds = adminProfiles.map((a) => a.userId);

    return {
      recipients: [...new Set([...studentIds, ...adminIds])],
      courseTitle: course.title,
    };
  });

  await notify({
    recipients,
    type: "course_cancelled",
    title: "Course cancelled",
    body: `The course "${courseTitle}" has been cancelled. Reason: ${reason}`,
    data: { courseId: id, reason },
  });

  return ok({ cancelled: true });
});
