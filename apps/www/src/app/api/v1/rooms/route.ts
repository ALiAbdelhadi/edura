import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { roomCreateSchema, assertMethod2Enablable } from "@/lib/services/rooms/rooms";

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
// The revenue SPLIT and the Method-2 per-student rate are NOT set here — they
// are superadmin-only config; the center only manages its room's presentation
// profile, hall price, and WHICH pricing methods the room offers.
export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, roomCreateSchema);
    const room = await scopedDb(user, async (tx) => {
      // A brand-new room can't have a room-scope rate yet — resolve on center.
      await assertMethod2Enablable(
        tx,
        { centerId: user.centerId },
        body.allowedPricingMethods,
      );
      return tx.room.create({ data: { centerId: user.centerId as string, ...body } });
    });
    return ok(room, { status: 201 });
  },
  { allow: MANAGER },
);
