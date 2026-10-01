import { withPlatformContext } from "@repo/database";

export function recordViewAsEnded(input: {
  actorId: string;
  action: string;
  targetId: string;
  targetRole: string;
  app: string;
  ipAddress: string | null;
}): Promise<unknown> {
  return withPlatformContext((tx) =>
    tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: "user",
        targetId: input.targetId,
        afterState: { targetRole: input.targetRole, app: input.app } as never,
        ipAddress: input.ipAddress,
        onBehalfOf: null,
      },
    }),
  );
}
