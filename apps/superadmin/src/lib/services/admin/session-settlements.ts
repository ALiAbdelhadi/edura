import { platformDb } from "@/lib/db/scope";

export type SettlementFilters = {
  centerId?: string;
  pricingMethod?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
};

const METHODS = new Set(["whole_room_percent", "per_attending_student"]);

export function listSessionSettlements(filters: SettlementFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));

  return platformDb(async (tx) => {
    const where = {
      ...(filters.centerId ? { centerId: filters.centerId } : {}),
      ...(filters.pricingMethod && METHODS.has(filters.pricingMethod)
        ? { pricingMethod: filters.pricingMethod as "whole_room_percent" | "per_attending_student" }
        : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      tx.sessionSettlement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.sessionSettlement.count({ where }),
    ]);

    const centerIds = [...new Set(rows.map((r) => r.centerId))];
    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const courseIds = [...new Set(rows.map((r) => r.courseId))];
    const roomIds = [...new Set(rows.map((r) => r.roomId).filter(Boolean))] as string[];
    const sessionIds = rows.map((r) => r.sessionId);

    const [centers, teachers, courses, rooms, liveCounts] = await Promise.all([
      centerIds.length
        ? tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } })
        : [],
      teacherIds.length
        ? tx.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
        : [],
      courseIds.length
        ? tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } })
        : [],
      roomIds.length
        ? tx.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } })
        : [],
      sessionIds.length
        ? tx.attendanceRecord.groupBy({
            by: ["sessionId"],
            where: { sessionId: { in: sessionIds }, status: "present" },
            _count: { _all: true },
          })
        : [],
    ]);

    const centerMap = new Map(centers.map((c) => [c.id, c.name]));
    const teacherMap = new Map(teachers.map((t) => [t.id, t.name]));
    const courseMap = new Map(courses.map((c) => [c.id, c.title]));
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));
    const liveMap = new Map(liveCounts.map((c) => [c.sessionId, c._count._all]));

    return {
      settlements: rows.map((r) => {
        const livePresentCount = liveMap.get(r.sessionId) ?? 0;
        return {
          ...r,
          centerName: centerMap.get(r.centerId) ?? null,
          teacherName: teacherMap.get(r.teacherId) ?? null,
          courseTitle: courseMap.get(r.courseId) ?? null,
          roomName: r.roomId ? (roomMap.get(r.roomId) ?? null) : null,
          livePresentCount,
          attendanceMismatch: livePresentCount !== r.presentCount,
        };
      }),
      meta: { total, page, limit },
    };
  });
}
