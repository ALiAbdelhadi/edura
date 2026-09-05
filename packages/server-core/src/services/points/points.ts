import { platformDb, type TenantTx } from "../../db/scope";
import { parsePageLimit } from "../../validation/common";

export type PointsEvent =
  | "attendance"
  | "online_payment"
  | "cash_payment"
  | "first_booking"
  | "lesson_booking"
  | "teacher_rating"
  | "streak_bonus";

const RULE_FALLBACK: Partial<Record<PointsEvent, PointsEvent>> = {
  cash_payment: "online_payment",
};

export async function awardPoints(
  tx: TenantTx,
  studentUserId: string,
  eventName: PointsEvent,
  opts?: { reason?: string; ruleOverride?: number },
): Promise<{ delta: number; balanceAfter: number } | null> {
  const fallbackName = RULE_FALLBACK[eventName];
  const rule =
    (await tx.pointsRule.findFirst({ where: { eventName, isActive: true } })) ??
    (fallbackName
      ? await tx.pointsRule.findFirst({ where: { eventName: fallbackName, isActive: true } })
      : null);
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
  const { limit } = parsePageLimit({ limit: opts?.limit }, 50);
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
      },
    });
    return rows;
  });
}
