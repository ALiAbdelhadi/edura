import { platformDb, type TenantTx } from "@/lib/db/scope";

export type PointsEvent =
  | "attendance"
  | "online_payment"
  | "first_booking"
  | "lesson_booking"
  | "teacher_rating"
  | "streak_bonus";

export async function awardPoints(
  tx: TenantTx,
  studentUserId: string,
  eventName: PointsEvent,
  opts?: { reason?: string; ruleOverride?: number },
): Promise<{ delta: number; balanceAfter: number } | null> {
  const rule = await tx.pointsRule.findFirst({
    where: { eventName, isActive: true },
  });
  if (!rule) return null;

  const profile = await tx.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: { id: true },
  });
  if (!profile) return null;

  const delta = opts?.ruleOverride ?? rule.pointsValue;

  const updated = await tx.studentProfile.update({
    where: { userId: studentUserId },
    data: { pointsBalance: { increment: delta } },
    select: { pointsBalance: true },
  });
  const balanceAfter = updated.pointsBalance;

  await tx.pointsLedger.create({
    data: {
      studentId: studentUserId,
      delta,
      balanceAfter,
      eventName,
      ruleId: rule.id,
      reason: opts?.reason ?? null,
    },
  });

  return { delta, balanceAfter };
}

export async function getStudentPoints(studentUserId: string) {
  return platformDb(async (tx) => {
    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { pointsBalance: true },
    });
    return { balance: profile?.pointsBalance ?? 0 };
  });
}

export async function listStudentPointsHistory(
  studentUserId: string,
  opts?: { limit?: number },
) {
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  return platformDb(async (tx) => {
    const rows = await tx.pointsLedger.findMany({
      where: { studentId: studentUserId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        delta: true,
        balanceAfter: true,
        eventName: true,
        reason: true,
        createdAt: true,
        // internalNote intentionally excluded — hidden from students.
      },
    });
    return rows;
  });
}
