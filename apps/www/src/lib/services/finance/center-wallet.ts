import { platformDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError, ForbiddenError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

// Center twin of teacher-wallet.ts: same available-balance semantics — open
// (pending/approved) payout requests reserve funds, so the same money can
// never be requested twice.

function centerIdOf(user: SessionUser): string {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  return user.centerId;
}

export function getCenterWallet(user: SessionUser) {
  const centerId = centerIdOf(user);
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { walletBalance: true },
    });
    if (!center) throw new NotFoundError("Center not found");
    const openPayouts = await tx.payout.aggregate({
      where: { beneficiaryId: centerId, beneficiaryType: "center", status: { in: ["pending", "approved"] } },
      _sum: { netPayable: true },
      _count: { _all: true },
    });
    const pending = openPayouts._sum.netPayable ?? 0;
    return {
      balance: center.walletBalance,
      pendingPayouts: { count: openPayouts._count._all, amount: pending },
      available: Math.max(0, center.walletBalance - pending),
    };
  });
}

export function getCenterWalletTransactions(user: SessionUser, opts?: { take?: number; cursor?: string }) {
  const centerId = centerIdOf(user);
  const take = Math.min(100, Math.max(1, opts?.take ?? 50));
  return platformDb(async (tx) => {
    const rows = await tx.transaction.findMany({
      where: { OR: [{ fromEntityId: centerId }, { toEntityId: centerId }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take].id : null;
    return { data: rows.slice(0, take), nextCursor };
  });
}

export function requestCenterPayout(user: SessionUser, amount?: number) {
  const centerId = centerIdOf(user);
  return platformDb(async (tx) => {
    // H1: lock the beneficiary row FIRST so concurrent requests serialize;
    // the second waits, then re-reads the now-committed open payouts and
    // correctly sees the reduced available balance.
    const locked = await tx.$queryRaw<{ wallet_balance: number }[]>`
      SELECT wallet_balance FROM centers WHERE id = ${centerId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Center not found");
    const walletBalance = locked[0].wallet_balance;

    const open = await tx.payout.aggregate({
      where: { beneficiaryId: centerId, status: { in: ["pending", "approved"] } },
      _sum: { netPayable: true },
    });
    const available = walletBalance - (open._sum.netPayable ?? 0);
    if (available <= 0) throw new BusinessRuleError("No available balance to pay out");
    const requested = amount ?? available;
    if (!Number.isInteger(requested) || requested <= 0) {
      throw new BusinessRuleError("Amount must be a positive whole number of piasters");
    }
    if (requested > available) {
      throw new BusinessRuleError(
        `Amount exceeds available balance (${(available / 100).toFixed(2)} EGP available)`,
      );
    }

    const commission = await tx.transaction.aggregate({
      where: { fromEntityId: centerId, type: "commission" },
      _sum: { amount: true },
    });
    return tx.payout.create({
      data: {
        beneficiaryId: centerId,
        beneficiaryType: "center",
        centerId,
        netPayable: requested,
        grossAmount: requested + (commission._sum.amount ?? 0),
        commission: commission._sum.amount ?? 0,
        status: "pending",
      },
    });
  }, { actorId: user.id });
}

export function listCenterPayouts(user: SessionUser) {
  const centerId = centerIdOf(user);
  return platformDb((tx) =>
    tx.payout.findMany({
      where: { beneficiaryId: centerId, beneficiaryType: "center" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}
