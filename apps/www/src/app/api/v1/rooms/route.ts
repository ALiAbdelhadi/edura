import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  const rooms = await scopedDb(user, (tx) =>
    tx.room.findMany({ where: { centerId: user.centerId, isActive: true } }),
  );
  return ok(rooms);
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  capacity: z.number().int().positive().optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, createSchema);
  const room = await scopedDb(user, (tx) =>
    tx.room.create({ data: { centerId: user.centerId as string, ...body } }),
  );
  return ok(room, { status: 201 });
});
