import { platformDb, type TenantTx } from "@/lib/db/scope";

/**
 * Points engine (PRD §5.7).
 *
 * `awardPoints` runs INSIDE an existing transaction (`tx`) so it composes with
 * the event that triggers it (payment, attendance, rating…) atomically — no
 * nested transactions. It is a no-op when no active rule exists for the event,
 * which is the intended behavior (points for an event are "off" until a
 * super_admin defines a rule).
 *
 * Students are keyed by their User id (consistent with enrollments/attendance).
 * `points_ledger` is append-only; balances live on `student_profiles`.
 */
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
    select: { id: true, pointsBalance: true },
  });
  if (!profile) return null;

  const delta = opts?.ruleOverride ?? rule.pointsValue;
  const balanceAfter = profile.pointsBalance + delta;

  await tx.studentProfile.update({
    where: { userId: studentUserId },
    data: { pointsBalance: balanceAfter },
  });
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

/** Student self-service: current balance. */
export async function getStudentPoints(studentUserId: string) {
  return platformDb(async (tx) => {
    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { pointsBalance: true },
    });
    return { balance: profile?.pointsBalance ?? 0 };
  });
}

/** Student self-service: ledger history (internal_note hidden). */
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
