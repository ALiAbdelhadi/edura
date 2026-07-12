import { platformDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Teacher wallet surface (PRD §4.5 wallet, wallet/transactions, payout-request).
 * The wallet balance is accumulated by the distribution engine on
 * teacher_profiles.wallet_balance; transactions come from the immutable ledger.
 */

export function getTeacherWallet(teacher: SessionUser) {
  return platformDb(async (tx) => {
    const profile = await tx.teacherProfile.findUnique({
      where: { userId: teacher.id },
      select: { walletBalance: true },
    });
    if (!profile) throw new NotFoundError("Teacher profile not found");
    const openPayouts = await tx.payout.aggregate({
      where: { beneficiaryId: teacher.id, beneficiaryType: "teacher", status: { in: ["pending", "approved"] } },
      _sum: { netPayable: true },
      _count: { _all: true },
    });
    const pending = openPayouts._sum.netPayable ?? 0;
    return {
      balance: profile.walletBalance,
      pendingPayouts: { count: openPayouts._count._all, amount: pending },
      available: Math.max(0, profile.walletBalance - pending),
    };
  });
}

export function getTeacherWalletTransactions(teacher: SessionUser, opts?: { take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, opts?.take ?? 50));
  return platformDb(async (tx) => {
    // Ledger rows where the teacher is the fee-payer (commission) or payout payee.
    const rows = await tx.transaction.findMany({
      where: { OR: [{ fromEntityId: teacher.id }, { toEntityId: teacher.id }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take].id : null;
    return { data: rows.slice(0, take), nextCursor };
  });
}

/** Teacher requests a payout of their available (unpaid) wallet balance. */
export function requestTeacherPayout(teacher: SessionUser) {
  return platformDb(async (tx) => {
    const profile = await tx.teacherProfile.findUnique({
      where: { userId: teacher.id },
      select: { walletBalance: true },
    });
    if (!profile) throw new NotFoundError("Teacher profile not found");

    const open = await tx.payout.aggregate({
      where: { beneficiaryId: teacher.id, status: { in: ["pending", "approved"] } },
      _sum: { netPayable: true },
    });
    const available = profile.walletBalance - (open._sum.netPayable ?? 0);
    if (available <= 0) throw new BusinessRuleError("No available balance to pay out");

    const commission = await tx.transaction.aggregate({
      where: { fromEntityId: teacher.id, type: "commission" },
      _sum: { amount: true },
    });
    const lessons = await tx.transaction.findMany({
      where: { fromEntityId: teacher.id, type: "commission" },
      select: { lessonId: true },
      distinct: ["lessonId"],
    });
    return tx.payout.create({
      data: {
        beneficiaryId: teacher.id,
        beneficiaryType: "teacher",
        netPayable: available,
        grossAmount: available + (commission._sum.amount ?? 0),
        commission: commission._sum.amount ?? 0,
        lessonCount: lessons.length,
        status: "pending",
      },
    });
  }, { actorId: teacher.id });
}
