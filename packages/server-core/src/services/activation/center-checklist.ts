import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { NotFoundError } from "../../errors/classes";

export const CHECKLIST_STEPS = ["profile", "teacher", "group", "student", "payment"] as const;
export type ChecklistStep = (typeof CHECKLIST_STEPS)[number];

export type CenterChecklist = {
  steps: { step: ChecklistStep; done: boolean }[];
  done: number;
  total: number;
  complete: boolean;
};

export async function getCenterChecklist(user: SessionUser): Promise<CenterChecklist> {
  const centerId = user.centerId as string;

  const flags = await scopedDb(user, async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { address: true, phone: true, governorate: true, area: true },
    });
    if (!center) throw new NotFoundError("Center not found");

    const profileDone = Boolean(
      center.address?.trim() && center.phone?.trim() && (center.governorate?.trim() || center.area?.trim()),
    );

    const [teacherGroups, courses, enrollments, payments] = await Promise.all([
      tx.course.groupBy({ by: ["teacherId"], where: { centerId, status: "active" } }),
      tx.course.count({ where: { centerId, status: "active" } }),
      tx.enrollment.count({ where: { centerId, status: "active" } }),
      tx.payment.count({ where: { centerId } }),
    ]);

    return {
      profile: profileDone,
      teacher: teacherGroups.length > 0,
      group: courses > 0,
      student: enrollments > 0,
      payment: payments > 0,
    } satisfies Record<ChecklistStep, boolean>;
  });

  const steps = CHECKLIST_STEPS.map((step) => ({ step, done: flags[step] }));
  const done = steps.filter((s) => s.done).length;

  return { steps, done, total: steps.length, complete: done === steps.length };
}
