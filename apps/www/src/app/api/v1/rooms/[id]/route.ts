import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { requireCenterScope } from "@/lib/authz/require-center-scope";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  roomPatchSchema,
  assertMethod2Enablable,
  pruneRemovedRoomPhotos,
  setRoomM2RateAsCenter,
  clearRoomM2RateAsCenter,
  splitRoomPayload,
} from "@/lib/services/rooms/rooms";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = centerStaff(
  async (req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    const body = await parseJson(req, roomPatchSchema);
    const { roomFields, perStudentRate } = splitRoomPayload(body);

    let previousPhotos: string[] = [];
    const updated = await scopedDb(user, async (tx) => {
      const room = await tx.room.findUnique({ where: { id } });
      if (!room) throw new NotFoundError("Room not found");
      requireCenterScope(user, room.centerId);
      // `perStudentRate === undefined` leaves the hall's rate alone, so the
      // inherited-or-own check still applies; setting one in this request
      // supersedes it (the ceiling check is stricter), and `null` clears the
      // override BEFORE the check so the fallback is what actually gets tested.
      if (perStudentRate === null) {
        await clearRoomM2RateAsCenter(tx, {
          roomId: id,
          centerId: room.centerId,
          actorId: user.id,
        });
      }
      if (!perStudentRate) {
        await assertMethod2Enablable(
          tx,
          { roomId: id, centerId: room.centerId },
          body.allowedPricingMethods,
        );
      } else {
        await setRoomM2RateAsCenter(
          tx,
          { roomId: id, centerId: room.centerId, actorId: user.id },
          perStudentRate,
        );
      }
      previousPhotos = room.photos;
      return tx.room.update({ where: { id }, data: roomFields });
    });
    if (body.photos) await pruneRemovedRoomPhotos(previousPhotos, updated.photos);
    return ok(updated);
  },
  { allow: MANAGER },
);

export const DELETE = centerStaff(
  async (_req, ctx, { acting: user }) => {
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

    await tx.room.update({ where: { id }, data: { isActive: false } });
      return { deleted: true };
    });
    return ok(result);
  },
  { allow: MANAGER },
);
