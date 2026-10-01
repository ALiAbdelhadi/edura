import type { Prisma } from "@repo/database";
import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";

export function listCenterSubscriptions(user: SessionUser, status: string | undefined) {
  return scopedDb(user, async (tx) => {
    const where: Prisma.SubscriptionWhereInput = { centerId: user.centerId };
    if (status) where.status = status as Prisma.SubscriptionWhereInput["status"];
    const subs = await tx.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const studentIds = [...new Set(subs.map((s) => s.studentId))];
    const courseIds = [...new Set(subs.map((s) => s.courseId))];
    const [students, courses] = await Promise.all([
      tx.user.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, name: true, email: true },
      }),
      tx.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
    ]);
    const sMap = new Map(students.map((s) => [s.id, s]));
    const cMap = new Map(courses.map((c) => [c.id, c]));
    return subs.map((s) => ({
      ...s,
      studentName: sMap.get(s.studentId)?.name ?? null,
      courseTitle: cMap.get(s.courseId)?.title ?? null,
    }));
  });
}
