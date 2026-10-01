import type { z } from "zod";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { requireCenterScope } from "../../authz/center-scope";
import { NotFoundError, BusinessRuleError } from "../../errors/classes";
import {
  roomCreateSchema,
  roomPatchSchema,
  assertMethod2Enablable,
  pruneRemovedRoomPhotos,
  setRoomM2RateAsCenter,
  clearRoomM2RateAsCenter,
  splitRoomPayload,
} from "./rooms";
import { pickM2, resolveRoomRateCeiling } from "./room-rate";

type RoomCreateInput = z.infer<typeof roomCreateSchema>;
type RoomPatchInput = z.infer<typeof roomPatchSchema>;

export function listCenterRooms(user: SessionUser) {
  return scopedDb(user, (tx) =>
    tx.room.findMany({ where: { centerId: user.centerId, isActive: true } }),
  );
}

export function createRoom(user: SessionUser, body: RoomCreateInput) {
  const { roomFields, perStudentRate } = splitRoomPayload(body);
  return scopedDb(user, async (tx) => {
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
}

export async function updateRoom(user: SessionUser, id: string, body: RoomPatchInput) {
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
  return updated;
}

export function deactivateRoom(user: SessionUser, id: string) {
  return scopedDb(user, async (tx) => {
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
}

export function getPerStudentAvailability(user: SessionUser) {
  return scopedDb(user, async (tx) => {
    const centerId = user.centerId as string;
    const rooms = await tx.room.findMany({
      where: { centerId, isActive: true },
      select: { id: true },
    });
    const own = rooms.length
      ? await tx.commissionSetting.findMany({
          where: { scope: "room", roomId: { in: rooms.map((r) => r.id) } },
        })
      : [];

    return {
      ceiling: await resolveRoomRateCeiling(tx, centerId),
      rooms: Object.fromEntries(
        own.map((row) => [row.roomId as string, pickM2(row)]).filter(([, rate]) => rate !== null),
      ),
    };
  });
}
