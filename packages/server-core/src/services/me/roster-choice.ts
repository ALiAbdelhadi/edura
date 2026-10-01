import { platformDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

export async function chooseRosterCenter(user: SessionUser, centerId: string) {
  return platformDb(
    async (tx) => {
      const chosen = await tx.centerStudentRoster.findFirst({
        where: { studentId: user.id, centerId, leftAt: null },
        select: { id: true },
      });
      if (!chosen) throw new NotFoundError("You are not on this center's roster");

      const left = await tx.centerStudentRoster.updateMany({
        where: { studentId: user.id, centerId: { not: centerId }, leftAt: null },
        data: { leftAt: new Date() },
      });
      return { keptCenterId: centerId, leftCenters: left.count };
    },
    { actorId: user.id },
  );
}
