import type { Session } from "@repo/database";
import type { TenantTx } from "../../db/scope";

export async function enrichSessions(tx: TenantTx, sessions: Session[]) {
  const courseIds = [...new Set(sessions.map((s) => s.courseId))];
  const teacherIds = [...new Set(sessions.map((s) => s.teacherId).filter(Boolean))];
  const roomIds = [...new Set(sessions.map((s) => s.roomId).filter(Boolean) as string[])];

  const [courses, teachers, rooms] = await Promise.all([
    tx.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, subject: true, centerId: true },
    }),
    tx.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, name: true },
    }),
    tx.room.findMany({
      where: { id: { in: roomIds } },
      select: { id: true, name: true },
    }),
  ]);
  const centerIds = [...new Set(courses.map((c) => c.centerId).filter(Boolean) as string[])];
  const centers = centerIds.length
    ? await tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } })
    : [];
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const centerMap = new Map(centers.map((c) => [c.id, c.name]));

  return sessions.map((s) => {
    const c = courseMap.get(s.courseId);
    const t = teacherMap.get(s.teacherId);
    const r = s.roomId ? roomMap.get(s.roomId) : null;
    return {
      ...s,
      courseName: c?.title ?? "",
      subject: c?.subject ?? "",
      teacherName: t?.name ?? "",
      roomName: r?.name ?? "",
      centerId: c?.centerId ?? null,
      centerName: (c?.centerId ? centerMap.get(c.centerId) : null) ?? "",
    };
  });
}
