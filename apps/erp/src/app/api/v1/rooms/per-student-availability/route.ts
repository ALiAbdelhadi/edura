import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { resolveRoomRateCeiling } from "@/lib/services/rooms/rooms";
import { pickM2 } from "@repo/server-core/services/rooms/room-rate";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => {
    const data = await scopedDb(user, async (tx) => {
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
    return ok(data);
  },
  { allow: MANAGER },
);
