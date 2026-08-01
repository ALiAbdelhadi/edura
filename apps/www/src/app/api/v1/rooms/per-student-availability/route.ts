import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { resolveRoomRateCeiling } from "@/lib/services/rooms/rooms";
import { pickM2 } from "@repo/server-core/services/rooms/room-rate";

export const dynamic = "force-dynamic";

/**
 * What the room form needs to price per-attending-student pricing:
 *
 *  - `ceiling` — the platform's published rate (center > global), which is the
 *    MAXIMUM the center may set for its own halls, and the value a hall uses
 *    when it sets nothing. `null` means the platform has published nothing, and
 *    the method cannot be offered at all yet.
 *  - `rooms[id]` — that hall's OWN override, or absent when it just inherits.
 *
 * The center sees these numbers now (it owns the hall and prices it). What it
 * still may not see or set is the whole-room revenue SPLIT — that is the
 * platform's cut and lives only in apps/superadmin.
 *
 * A hint for the form, never the gate: `setRoomM2RateAsCenter` re-resolves the
 * ceiling on write, so a stale page cannot get a rate past it.
 */
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
