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

type ChecklistRow = {
  center: { address: string | null; phone: string | null; governorate: string | null; area: string | null } | null;
  activeCourse: boolean;
  enrollment: boolean;
  payment: boolean;
};

export async function getCenterChecklist(user: SessionUser): Promise<CenterChecklist> {
  const centerId = user.centerId as string;

  const flags = await scopedDb(user, async (tx) => {
    const [row] = await tx.$queryRaw<ChecklistRow[]>`
      SELECT
        (SELECT json_build_object('address', address, 'phone', phone,
                                  'governorate', governorate, 'area', area)
           FROM centers WHERE id = ${centerId}::uuid) AS center,
        EXISTS (SELECT 1 FROM courses WHERE center_id = ${centerId}::uuid AND status = 'active') AS "activeCourse",
        EXISTS (SELECT 1 FROM enrollments WHERE center_id = ${centerId}::uuid AND status = 'active') AS enrollment,
        EXISTS (SELECT 1 FROM payments WHERE center_id = ${centerId}::uuid) AS payment`;

    const center = row?.center;
    if (!center) throw new NotFoundError("Center not found");

    const profileDone = Boolean(
      center.address?.trim() && center.phone?.trim() && (center.governorate?.trim() || center.area?.trim()),
    );

    // Every course has a teacher (`teacher_id` is NOT NULL), so "a teacher runs
    // an active course here" and "an active course exists" are the same fact.
    return {
      profile: profileDone,
      teacher: row.activeCourse,
      group: row.activeCourse,
      student: row.enrollment,
      payment: row.payment,
    } satisfies Record<ChecklistStep, boolean>;
  });

  const steps = CHECKLIST_STEPS.map((step) => ({ step, done: flags[step] }));
  const done = steps.filter((s) => s.done).length;

  return { steps, done, total: steps.length, complete: done === steps.length };
}
