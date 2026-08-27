import type { TenantTx } from "../../db/scope";

export type LessonCloseShape = {
  status: string;
  distributedAt: Date | null;
};

export function lessonClosed(session: LessonCloseShape): boolean {
  return (
    session.status === "cancelled" ||
    session.status === "completed" ||
    session.distributedAt !== null
  );
}

export async function lockSessionRow(tx: TenantTx, sessionId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
}
