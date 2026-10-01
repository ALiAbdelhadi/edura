import { platformDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import { resolveMethod2RatesForRooms } from "../finance/commission";

export function browseCenterRooms(id: string) {
  return platformDb(async (tx) => {
    const center = await tx.center.findFirst({
      where: { id, status: "active" },
      select: { id: true, name: true },
    });
    if (!center) throw new NotFoundError("Center not found");

    const roomRows = await tx.room.findMany({
      where: { centerId: id, isActive: true },
      select: {
        id: true,
        name: true,
        capacity: true,
        facilities: true,
        photos: true,
        price: true,
        description: true,
        allowedPricingMethods: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const perStudentRates = await resolveMethod2RatesForRooms(tx, {
      centerId: id,
      roomIds: roomRows.map((r) => r.id),
    });

    const rooms = roomRows.map((r) => {
      const offersPerStudent = r.allowedPricingMethods.includes("per_attending_student");
      const rate = offersPerStudent ? perStudentRates[r.id] : null;
      return {
        ...r,
        price:
          r.allowedPricingMethods.length === 1 && offersPerStudent ? null : r.price,
        perStudentRate: rate ? { fee: rate.fee, bp: rate.bp } : null,
      };
    });

    const roomIds = rooms.map((r) => r.id);
    const now = new Date();
    const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const sessions = roomIds.length
      ? await tx.session.findMany({
          where: {
            roomId: { in: roomIds },
            date: { gte: now, lte: horizon },
            status: { in: ["scheduled", "postponed", "ongoing"] },
          },
          select: { roomId: true, date: true, startTime: true, endTime: true },
          orderBy: { date: "asc" },
          take: 500,
        })
      : [];

    const busyByRoom = new Map<string, { date: Date; startTime: string; endTime: string }[]>();
    for (const s of sessions) {
      if (!s.roomId) continue;
      const list = busyByRoom.get(s.roomId) ?? [];
      if (list.length < 20) list.push({ date: s.date, startTime: s.startTime, endTime: s.endTime });
      busyByRoom.set(s.roomId, list);
    }

    return {
      centerId: center.id,
      centerName: center.name,
      rooms: rooms.map((r) => ({ ...r, busyTimes: busyByRoom.get(r.id) ?? [] })),
    };
  });
}
