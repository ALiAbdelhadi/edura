import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { resolveMethod2RatesForRooms } from "@/lib/services/finance/commission";

export const dynamic = "force-dynamic";

// Teacher-facing view of a center's rooms for the collaboration booking flow.
// Deliberately NOT the center-admin /api/v1/rooms route (that one is tenant-
// scoped to the caller's OWN center). This exposes presentation fields, busy
// times, and — for a hall offering per-attending-student pricing — WHAT THAT
// HALL TAKES per attending student, so the teacher can see the cost of the
// deal before agreeing to it. It still never exposes the whole-room revenue
// split (platform/teacher/center %), which is superadmin-only config.
export const GET = withErrors(async (_req, ctx) => {
  // Teachers (and their assistants) browse rooms when proposing a class.
  await requireRole("teacher", "assistant");
  const { id } = await ctx.params;

  const result = await platformDb(async (tx) => {
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

    // What each hall takes per attending student (room > center > global) —
    // resolved for every hall in one query, then attached only to the halls
    // that actually offer the method.
    const perStudentRates = await resolveMethod2RatesForRooms(tx, {
      centerId: id,
      roomIds: roomRows.map((r) => r.id),
    });

    const rooms = roomRows.map((r) => {
      const offersPerStudent = r.allowedPricingMethods.includes("per_attending_student");
      const rate = offersPerStudent ? perStudentRates[r.id] : null;
      return {
        ...r,
        // Price visibility rule: a per-student-only hall shows NO whole-room
        // price — that number is meaningless for it, since the cost depends on
        // attendance. Server-side hiding (not presentation): nulled here. The
        // per-student rate below is what such a hall costs, and it is now
        // shown rather than left for the teacher to discover at settlement.
        price:
          r.allowedPricingMethods.length === 1 && offersPerStudent ? null : r.price,
        // `source` (room/center/global) is deliberately NOT exposed — the
        // teacher needs the number, not where the center got it from.
        perStudentRate: rate ? { fee: rate.fee, bp: rate.bp } : null,
      };
    });

    // Upcoming committed sessions per room → "busy times" the teacher can avoid.
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

  return ok(result);
});
