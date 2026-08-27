import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { scopedDb } from "@/lib/db/scope";
import { createWalkInSubscription } from "@/lib/services/subscriptions/subscriptions";
import type { Prisma } from "@repo/database";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    studentId: z.string().uuid(),
    courseId: z.string().uuid(),
    plan: z.enum(["monthly", "per_session"]),
    sessionId: z.string().uuid().optional(),
    markAttendance: z.boolean().optional(),
    paymentMethod: z.enum(["cash", "instapay", "pos_card", "mobile_wallet"]).optional(),
  })
  .strict();

export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, bodySchema);
    return ok(await createWalkInSubscription(body, user), { status: 201 });
  },
  { allow: RECEPTION },
);

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;

  const rows = await scopedDb(user, async (tx) => {
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
    return ok(rows);
  },
  { allow: RECEPTION },
);
