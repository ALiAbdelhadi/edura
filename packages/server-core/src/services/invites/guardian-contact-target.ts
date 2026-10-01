import { platformDb } from "../../db/scope";
import { ForbiddenError, NotFoundError } from "../../errors/classes";

export async function resolveGuardianContactTarget(
  session: { id: string; role: string },
  studentId?: string,
): Promise<string> {
  if (session.role === "student") return session.id;
  if (session.role === "parent") {
    if (!studentId) throw new NotFoundError("studentId is required");
    const link = await platformDb((tx) =>
      tx.parentStudentLink.findFirst({
        where: { parentId: session.id, studentId, status: "approved" },
        select: { id: true },
      }),
    );
    if (!link) throw new ForbiddenError();
    return studentId;
  }
  throw new ForbiddenError();
}
