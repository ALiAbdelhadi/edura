import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { notify } from "@/lib/services/notifications/notify";
import { resolveCourseStudentsAndParents } from "@/lib/services/notifications/fanout";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";

export const dynamic = "force-dynamic";

const broadcastSchema = z.object({
  scope: z.enum(["center", "course"]),
  courseId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const data = await parseJson(req, broadcastSchema);

  if (data.scope === "course" && !data.courseId) {
    throw new Error("courseId is required when scope is 'course'");
  }

  let recipients: string[] = [];

  if (data.scope === "course" && data.courseId) {
    const courseId = data.courseId;
    await scopedDb(user, async (tx) => {
      const course = await tx.course.findUnique({
        where: { id: courseId },
        select: { centerId: true },
      });
      if (!course) throw new NotFoundError("Course not found");
      requireCenterScope(user, course.centerId);
    });
    recipients = await resolveCourseStudentsAndParents(courseId);
  } else {
    const centerId = user.centerId!;
    const studentIds = await scopedDb(user, async (tx) => {
      const enrollments = await tx.enrollment.findMany({
        where: { centerId, status: "active" },
        select: { studentId: true },
      });
      return [...new Set(enrollments.map((e) => e.studentId))];
    });

    const { withParentFallback } = await import("@/lib/services/notifications/fanout");
    const resolved = await Promise.all(studentIds.map((sid) => withParentFallback(sid)));
    recipients = [...new Set(resolved.flat())];
  }

  await notify({
    recipients,
    type: "admin_broadcast",
    title: data.title,
    body: data.body,
    data: { scope: data.scope, courseId: data.courseId },
  });

  return ok({ sent: recipients.length });
});
