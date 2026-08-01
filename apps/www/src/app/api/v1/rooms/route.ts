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

// price is piasters (client converts EGP→piasters, like the rest of the app).
// The revenue SPLIT stays superadmin-only config — that is the platform's cut.
// The per-student rate is the HALL's own, so the center sets it here, bounded
// by the platform's published rate (setRoomM2RateAsCenter enforces the ceiling
// and re-checks ownership; this route is not the gate).
export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, roomCreateSchema);
    const { roomFields, perStudentRate } = splitRoomPayload(body);
    const room = await scopedDb(user, async (tx) => {
      // A brand-new room can't have a room-scope rate yet — resolve on center.
      // Skipped when the caller is setting the hall's OWN rate in this same
      // request: there is then a rate by definition, and the ceiling check
      // below is the stricter gate.
      if (!perStudentRate) {
        await assertMethod2Enablable(tx, { centerId: user.centerId }, body.allowedPricingMethods);
      }
      const created = await tx.room.create({
        data: { centerId: user.centerId as string, ...roomFields },
      });
      // Same transaction as the room: a hall never exists with a rate the
      // ceiling would have rejected, and never half-created if it does.
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
