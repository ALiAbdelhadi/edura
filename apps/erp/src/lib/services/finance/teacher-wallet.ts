import { platformDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { dayRange } from "@repo/server-core/lib/day-range";


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

export function getTeacherWalletTransactions(
  teacher: SessionUser,
  opts?: { take?: number; cursor?: string; from?: string; to?: string },
) {
  const take = Math.min(100, Math.max(1, opts?.take ?? 50));
  const createdAt = dayRange(opts?.from, opts?.to);
  return platformDb(async (tx) => {
    const rows = await tx.transaction.findMany({
      where: {
        OR: [{ fromEntityId: teacher.id }, { toEntityId: teacher.id }],
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take].id : null;

    let totals: { earned: number; deducted: number; net: number } | null = null;
    if (createdAt) {
      const [credit, debit] = await Promise.all([
        tx.transaction.aggregate({
          where: { toEntityId: teacher.id, ...(createdAt ? { createdAt } : {}) },
          _sum: { amount: true },
        }),
        tx.transaction.aggregate({
          where: { fromEntityId: teacher.id, ...(createdAt ? { createdAt } : {}) },
          _sum: { amount: true },
        }),
      ]);
      const earned = credit._sum.amount ?? 0;
      const deducted = debit._sum.amount ?? 0;
      totals = { earned, deducted, net: earned - deducted };
    }

    return { data: rows.slice(0, take), nextCursor, totals };
  });
}

// Must cover the client's money-write timeout (45s) plus a human retry.
const PAYOUT_REPLAY_WINDOW_MS = 120_000;

export function requestTeacherPayout(
  teacher: SessionUser,
  amount?: number,
  clientRequestId?: string,
) {
  return platformDb(async (tx) => {
    const locked = await tx.$queryRaw<{ wallet_balance: number }[]>`
      SELECT wallet_balance FROM teacher_profiles WHERE user_id = ${teacher.id}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Teacher profile not found");
    const walletBalance = locked[0].wallet_balance;

    // Keyed idempotency, checked BEFORE availability on purpose: a matching
    // key means "this exact request already succeeded" — the money was
    // reserved by that very row, so returning it creates nothing and is safe
    // even when the remaining balance is now zero. The amount-based replay
    // guard below stays AFTER the availability check because it is a guess,
    // not an identity.
    if (clientRequestId) {
      const keyed = await tx.payout.findFirst({
        where: { beneficiaryId: teacher.id, clientRequestId },
      });
      if (keyed) return keyed;
    }

    const open = await tx.payout.aggregate({
      where: { beneficiaryId: teacher.id, status: { in: ["pending", "approved"] } },
      _sum: { netPayable: true },
    });
    const available = walletBalance - (open._sum.netPayable ?? 0);
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

    // Replay guard: a client that timed out and retried must not mint a second
    // payout. The FOR UPDATE lock above serializes concurrent requests, so an
    // identical pending request inside the window is a retry, not a new intent.
    const replay = await tx.payout.findFirst({
      where: {
        beneficiaryId: teacher.id,
        beneficiaryType: "teacher",
        status: "pending",
        netPayable: requested,
        createdAt: { gte: new Date(Date.now() - PAYOUT_REPLAY_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (replay) return replay;

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
        clientRequestId: clientRequestId ?? null,
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
