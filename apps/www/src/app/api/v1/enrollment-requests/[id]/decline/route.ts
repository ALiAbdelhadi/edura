import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { notify } from "@/lib/services/notifications/notify";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().optional(),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const { reason } = await parseJson(req, bodySchema);

  const { studentId, courseId, courseTitle } = await scopedDb(user, async (tx) => {
    const request = await tx.enrollmentRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Request not found");
    requireCenterScope(user, request.centerId);

    if (request.status !== "pending") {
      throw new BusinessRuleError(`Request is already ${request.status}`);
    }

    await tx.enrollmentRequest.update({
      where: { id },
      data: {
        status: "declined",
        respondedAt: new Date(),
        respondedBy: user.id,
        ...(reason ? { declineReason: reason } : {}),
      },
    });

    const course = await tx.course.findUnique({
      where: { id: request.courseId },
      select: { title: true },
    });

    return {
      studentId: request.studentId,
      courseId: request.courseId,
      courseTitle: course?.title ?? "the course",
    };
  });

  await notify({
    recipients: [studentId],
    type: "enrollment_request_declined",
    title: "Enrollment declined",
    body: `Your enrollment request for "${courseTitle}" has been declined.`,
    data: { courseId, requestId: id, reason },
  });

  return ok({ declined: true });
});
