import type { TenantTx } from "../db/scope";
import { ForbiddenError } from "../errors/classes";
import type { SessionUser } from "../auth/types";

export async function resolveActingTeacher(
  tx: TenantTx,
  user: SessionUser,
): Promise<string> {
  if (user.role === "teacher") return user.id;
  if (user.role !== "assistant") throw new ForbiddenError();
  const link = await tx.teacherAssistant.findFirst({
    where: { assistantId: user.id, removedAt: null },
    select: { teacherId: true },
  });
  if (!link) throw new ForbiddenError("Assistant is not linked to a teacher");
  return link.teacherId;
}
