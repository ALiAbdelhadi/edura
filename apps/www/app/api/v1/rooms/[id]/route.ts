import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { requireCenterScope } from "@/lib/authz/requireCenterScope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  capacity: z.number().int().positive().optional(),
});

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);

  const updated = await scopedDb(user, async (tx) => {
    const room = await tx.room.findUnique({ where: { id } });
    // RLS already prevents cross-tenant reads; keep the explicit check as
    // defense-in-depth and to return a clean 404/403 semantics.
    if (!room) throw new NotFoundError("Room not found");
    requireCenterScope(user, room.centerId);
    return tx.room.update({ where: { id }, data: body });
  });
  return ok(updated);
});

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;

  const result = await scopedDb(user, async (tx) => {
    const room = await tx.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundError("Room not found");
    requireCenterScope(user, room.centerId);

    const futureSessions = await tx.session.count({
      where: {
        roomId: id,
        date: { gte: new Date() },
        status: { in: ["scheduled", "postponed"] },
      },
    });
    if (futureSessions > 0) {
      throw new BusinessRuleError("Cannot delete room referenced by future sessions");
    }

    await tx.room.delete({ where: { id } });
    return { deleted: true };
  });
  return ok(result);
});
