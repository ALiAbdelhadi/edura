import type { TenantTx } from "../../db/scope";

/**
 * Which of these students hold ACTIVE payment coverage for this session.
 *
 * Extracted out of apps/www/src/lib/services/subscriptions/subscriptions.ts
 * (which also carries the checkout/settlement money paths neither the kernel
 * attendance code nor the back office needs) so the attendance and check-in
 * services could move without dragging the whole payment engine with them.
 * www re-exports this exact function.
 *
 * Coverage is EITHER a single-session pass tied to this session, OR a monthly
 * subscription for the course whose window contains the session's date.
 */
export async function coveredStudentIds(
  tx: TenantTx,
  session: { id: string; courseId: string; date: Date },
  studentIds: string[],
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const subs = await tx.subscription.findMany({
    where: {
      studentId: { in: studentIds },
      status: "active",
      OR: [
        { plan: "per_session", sessionId: session.id },
        {
          plan: "monthly",
          courseId: session.courseId,
          periodStart: { lte: session.date },
          periodEnd: { gte: session.date },
        },
      ],
    },
    select: { studentId: true },
  });
  return new Set(subs.map((s) => s.studentId));
}
