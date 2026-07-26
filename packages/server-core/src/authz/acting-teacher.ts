import type { TenantTx } from "../db/scope";
import { ForbiddenError } from "../errors/classes";
import type { SessionUser } from "../auth/types";

/**
 * The teacher a caller is acting for: themselves, or — for an assistant — the
 * ONE teacher they are actively linked to (Step 8; the link is soft-revoked by
 * `removedAt`, so a removed assistant resolves to nothing and is refused on the
 * very next request).
 *
 * Extracted out of apps/www/src/lib/authz/teacher-actor.ts, whose other exports
 * are HTTP/session-layer wrappers that do not belong in the kernel. www
 * re-exports this exact function.
 */
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
