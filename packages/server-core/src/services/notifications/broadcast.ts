import { scopedDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { requireCenterScope } from "../../authz/center-scope";
import { notify } from "./notify";
import { resolveCourseStudentsAndParents, withParentFallbackMany } from "./fanout";

export type CenterBroadcastInput = {
  scope: "center" | "course";
  courseId?: string;
  title: string;
  body: string;
};

export async function broadcastCenterNotification(
  user: SessionUser,
  data: CenterBroadcastInput,
): Promise<number> {
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

    recipients = await withParentFallbackMany(studentIds);
  }

  await notify({
    recipients,
    type: "admin_broadcast",
    title: data.title,
    body: data.body,
    data: { scope: data.scope, courseId: data.courseId },
  });

  return recipients.length;
}
