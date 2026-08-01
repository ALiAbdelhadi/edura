import { scopedDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors/classes";

/**
 * The center-owner setup checklist.
 *
 * Every step is DERIVED from the database — there is no "step completed" flag
 * anywhere. That matters more than it looks: a stored flag drifts the moment
 * someone deletes their only teacher, and the checklist then congratulates an
 * empty center. Deriving means the list is always telling the truth about the
 * account as it stands right now.
 *
 * Dismissal is the one thing that is NOT derived (it is a preference, not a
 * fact), and it lives in localStorage on the client — see the note in
 * `SetupChecklist`.
 *
 * Six cheap counts under the center's own RLS scope, so this cannot report on
 * anyone else's center even if the caller lied about theirs.
 */

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

    // "Profile complete" = the fields a student actually needs in order to find
    // and reach the center. Name and email are set at sign-up, so requiring
    // them here would mark the step done before the owner had done anything.
    const profileDone = Boolean(
      center.address?.trim() && center.phone?.trim() && (center.governorate?.trim() || center.area?.trim()),
    );

    // Same derivation the center home uses for its teacher counter: distinct
    // teachers across the center's active courses. Counting affiliations
    // instead would tick this step for a teacher who accepted and then never
    // got a class.
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
