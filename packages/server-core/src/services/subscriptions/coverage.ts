import type { TenantTx } from "../../db/scope";

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
