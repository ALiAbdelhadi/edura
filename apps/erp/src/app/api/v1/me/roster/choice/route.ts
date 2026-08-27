import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ centerId: z.string().uuid() }).strict();

export const POST = withErrors(async (req) => {
  const user = await requireRole("student");
  const { centerId } = await parseJson(req, bodySchema);

  const result = await platformDb(
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
  return ok(result);
});
