import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  roomCreateSchema,
  assertMethod2Enablable,
  setRoomM2RateAsCenter,
  splitRoomPayload,
} from "@/lib/services/rooms/rooms";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => {
    const rooms = await scopedDb(user, (tx) =>
      tx.room.findMany({ where: { centerId: user.centerId, isActive: true } }),
    );
    return ok(rooms);
  },
  { allow: MANAGER },
);

export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, roomCreateSchema);
    const { roomFields, perStudentRate } = splitRoomPayload(body);
    const room = await scopedDb(user, async (tx) => {
      if (!perStudentRate) {
        await assertMethod2Enablable(tx, { centerId: user.centerId }, body.allowedPricingMethods);
      }
      const created = await tx.room.create({
        data: { centerId: user.centerId as string, ...roomFields },
      });
      if (perStudentRate) {
        await setRoomM2RateAsCenter(
          tx,
          { roomId: created.id, centerId: user.centerId as string, actorId: user.id },
          perStudentRate,
        );
      }
      return created;
    });
    return ok(room, { status: 201 });
  },
  { allow: MANAGER },
);
