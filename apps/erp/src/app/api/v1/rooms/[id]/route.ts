import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { invalidatesPublicData } from "@/lib/cache/public-data";
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

const handlePatch = centerStaff(
  async (req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    const body = await parseJson(req, roomPatchSchema);
    const { roomFields, perStudentRate } = splitRoomPayload(body);

    let previousPhotos: string[] = [];
    const updated = await scopedDb(user, async (tx) => {
      const room = await tx.room.findUnique({ where: { id } });
      if (!room) throw new NotFoundError("Room not found");
      requireCenterScope(user, room.centerId);
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
    if (body.photos) await pruneRemovedRoomPhotos(id, previousPhotos, updated.photos);
    return ok(updated);
  },
  { allow: MANAGER },
);

const handleDelete = centerStaff(
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

// A hall's amenities appear on the centre's public page, which is cached.
export const PATCH = invalidatesPublicData(handlePatch, ["publicProfile"]);
export const DELETE = invalidatesPublicData(handleDelete, ["publicProfile"]);
