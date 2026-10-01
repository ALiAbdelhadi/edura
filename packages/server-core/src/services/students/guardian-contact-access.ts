import { platformDb } from "../../db/scope";
import { assertOnCenterRoster } from "../center/roster-membership";

export function recordGuardianContactView(input: {
  centerId: string;
  studentId: string;
  actorId: string;
  onBehalfOf: string | null;
}): Promise<void> {
  return platformDb(async (tx) => {
    await assertOnCenterRoster(tx, input.centerId, input.studentId);
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "student.guardian_contact_viewed",
        targetType: "student",
        targetId: input.studentId,
        centerId: input.centerId,
        onBehalfOf: input.onBehalfOf,
      },
    });
  });
}

export function assertStudentOnCenterRoster(centerId: string, studentId: string): Promise<void> {
  return platformDb((tx) => assertOnCenterRoster(tx, centerId, studentId));
}
