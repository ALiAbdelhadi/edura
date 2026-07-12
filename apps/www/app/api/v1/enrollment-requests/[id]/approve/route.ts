import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { requireCenterScope } from "@/lib/authz/requireCenterScope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError, ExpiredError, ConflictError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { notify } from "@/lib/services/notifications/notify";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;

  const { request, courseTitle, studentId, courseId } = await scopedDb(user, async (tx) => {
    const request = await tx.enrollmentRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Request not found");
    requireCenterScope(user, request.centerId);

    if (request.status !== "pending") {
      throw new BusinessRuleError(`Request is already ${request.status}`);
    }
    if (request.expiresAt < new Date()) {
      await tx.enrollmentRequest.update({ where: { id }, data: { status: "expired" } });
      throw new ExpiredError("Enrollment request has expired");
    }

    const course = await tx.course.findUnique({ where: { id: request.courseId } });
    if (!course) throw new NotFoundError("Course not found");

    // Capacity check
    const activeCount = await tx.enrollment.count({
      where: { courseId: request.courseId, status: "active" },
    });
    if (activeCount >= course.maxStudents) {
      throw new BusinessRuleError("Course is full", { code: "course_full" });
    }

    // Check duplicate active enrollment
    const alreadyEnrolled = await tx.enrollment.findFirst({
      where: { studentId: request.studentId, courseId: request.courseId, status: "active" },
    });
    if (alreadyEnrolled) throw new ConflictError("Student already enrolled");

    try {
      await tx.enrollment.create({
        data: {
          studentId: request.studentId,
          courseId: request.courseId,
          centerId: request.centerId,
          status: "active",
          enrolledAt: new Date(),
          enrolledBy: user.id,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("Student already enrolled");
      }
      throw err;
    }

    const updated = await tx.enrollmentRequest.update({
      where: { id },
      data: {
        status: "approved",
        respondedAt: new Date(),
        respondedBy: user.id,
      },
    });

    return {
      request: updated,
      courseTitle: course.title,
      studentId: request.studentId,
      courseId: request.courseId,
    };
  });

  await notify({
    recipients: [studentId],
    type: "enrollment_request_approved",
    title: "Enrollment approved",
    body: `Your enrollment request for "${courseTitle}" has been approved.`,
    data: { courseId, requestId: id },
  });

  return ok({ approved: true, ...request });
});
