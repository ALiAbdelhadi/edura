import { platformDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";


export function listPointsRules() {
  return platformDb((tx) => tx.pointsRule.findMany({ orderBy: { eventName: "asc" } }));
}

export function createPointsRule(
  data: { eventName: string; pointsValue: number; isActive?: boolean },
  adminId: string,
) {
  return platformDb((tx) =>
    tx.pointsRule.create({
      data: {
        eventName: data.eventName,
        pointsValue: data.pointsValue,
        isActive: data.isActive ?? true,
        createdBy: adminId,
      },
    }),
  );
}

export function updatePointsRule(
  id: string,
  data: { pointsValue?: number; isActive?: boolean },
) {
  return platformDb(async (tx) => {
    const rule = await tx.pointsRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundError("Points rule not found");
    return tx.pointsRule.update({ where: { id }, data });
  });
}

export function deletePointsRule(id: string) {
  return platformDb(async (tx) => {
    const rule = await tx.pointsRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundError("Points rule not found");
    await tx.pointsRule.delete({ where: { id } });
    return { deleted: true };
  });
}

export function getStudentLedger(studentUserId: string, opts?: { limit?: number }) {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  return platformDb(async (tx) => {
    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { pointsBalance: true },
    });
    if (!profile) throw new NotFoundError("Student not found");
    const ledger = await tx.pointsLedger.findMany({
      where: { studentId: studentUserId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { balance: profile.pointsBalance, ledger };
  });
}

export function adjustStudentPoints(
  studentUserId: string,
  input: { delta: number; reason: string; internalNote?: string },
  adminId: string,
) {
  return platformDb(async (tx) => {
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new BusinessRuleError("delta must be a non-zero integer");
    }
    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundError("Student not found");

    const updated = await tx.studentProfile.update({
      where: { userId: studentUserId },
      data: { pointsBalance: { increment: input.delta } },
      select: { pointsBalance: true },
    });
    const balanceAfter = updated.pointsBalance;
    if (balanceAfter < 0) throw new BusinessRuleError("Adjustment would make the balance negative");

    const entry = await tx.pointsLedger.create({
      data: {
        studentId: studentUserId,
        delta: input.delta,
        balanceAfter,
        eventName: "manual_adjustment",
        adjustedBy: adminId,
        reason: input.reason,
        internalNote: input.internalNote ?? null,
      },
    });
    return { balance: balanceAfter, entry };
  });
}
