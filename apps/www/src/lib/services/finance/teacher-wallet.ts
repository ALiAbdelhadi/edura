import { platformDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";


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

export function requestTeacherPayout(teacher: SessionUser, amount?: number) {
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
    // Available = wallet minus funds already reserved by open requests — the
    // guard that makes double-requesting the same money impossible.
    const available = profile.walletBalance - (open._sum.netPayable ?? 0);
    if (available <= 0) throw new BusinessRuleError("No available balance to pay out");
    const requested = amount ?? available; // default: withdraw everything available
    if (!Number.isInteger(requested) || requested <= 0) {
      throw new BusinessRuleError("Amount must be a positive whole number of piasters");
    }
    if (requested > available) {
      throw new BusinessRuleError(
        `Amount exceeds available balance (${(available / 100).toFixed(2)} EGP available)`,
      );
    }

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
        netPayable: requested,
        grossAmount: requested + (commission._sum.amount ?? 0),
        commission: commission._sum.amount ?? 0,
        lessonCount: lessons.length,
        status: "pending",
      },
    });
  }, { actorId: teacher.id });
}

export function listTeacherPayouts(teacher: SessionUser) {
  return platformDb((tx) =>
    tx.payout.findMany({
      where: { beneficiaryId: teacher.id, beneficiaryType: "teacher" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}
