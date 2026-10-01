import { platformDb } from "../../db/scope";

export type StaffSessionCompletedAudit = {
  actorId: string;
  sessionId: string;
  centerId: string | undefined;
  staffRole: string;
  distributed: boolean;
  presentCount: number;
};

export function auditStaffSessionCompleted(input: StaffSessionCompletedAudit) {
  return platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "session.completed",
          targetType: "session",
          targetId: input.sessionId,
          afterState: {
            onBehalfOfCenter: input.centerId,
            staffRole: input.staffRole,
            distributed: input.distributed,
            presentCount: input.presentCount,
          },
        },
      }),
    { actorId: input.actorId },
  );
}
