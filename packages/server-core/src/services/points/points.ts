import { platformDb, type TenantTx } from "../../db/scope";

export type PointsEvent =
  | "attendance"
  | "online_payment"
  | "cash_payment"
  | "first_booking"
  | "lesson_booking"
  | "teacher_rating"
  | "streak_bonus";

/**
 * A rule an event may BORROW its value from when its own row is not seeded yet.
 *
 * `cash_payment` exists because cash taken at the counter was being written to
 * the points ledger as `online_payment` — the reason text said "(cash)" while
 * the event said the opposite, in an append-only ledger nobody can correct
 * later. Naming it truthfully is a code change; the RULE ROW is data, and it
 * only reaches dev / test / production when someone runs the seed. Without a
 * fallback the honest name would silently stop awarding points on every already
 * -seeded environment the moment this deploys — a real regression traded for a
 * label. Borrowing keeps the awarded value byte-identical to today's until a
 * `cash_payment` rule is seeded, at which point cash can be priced on its own.
 *
 * `ruleId` on the ledger row then points at the rule that actually PRICED the
 * award, which is the honest record of how the number was arrived at.
 */
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
      },
    });
    return rows;
  });
}
