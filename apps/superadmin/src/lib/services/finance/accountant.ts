import { platformDb } from "@/lib/db/scope";
import type { Prisma } from "@repo/database";
import { parsePageLimit } from "@/lib/validation/common";


type TxFilters = {
  type?: string;
  status?: string;
  centerId?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

const TX_TYPES = new Set(["payment", "commission", "payout", "refund", "adjustment"]);
const TX_STATUSES = new Set(["pending", "completed", "failed", "reversed"]);

export function listTransactions(filters: TxFilters) {
  const { page, limit } = parsePageLimit(filters, 50);

  return platformDb(async (tx) => {
    const where: Prisma.TransactionWhereInput = {};
    if (filters.type && TX_TYPES.has(filters.type)) {
      where.type = filters.type as Prisma.TransactionWhereInput["type"];
    }
    if (filters.status && TX_STATUSES.has(filters.status)) {
      where.status = filters.status as Prisma.TransactionWhereInput["status"];
    }
    if (filters.centerId) where.centerId = filters.centerId;
    if (filters.from || filters.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.from) createdAt.gte = new Date(filters.from);
      if (filters.to) createdAt.lte = new Date(filters.to);
      where.createdAt = createdAt;
    }

    const [items, total] = await Promise.all([
      tx.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.transaction.count({ where }),
    ]);
    return { items, total, page, limit };
  });
}

export function financeDashboard() {
  return platformDb(async (tx) => {
    const [commission, grossRevenue, refunds, pendingPayouts, expenses] = await Promise.all([
      tx.transaction.aggregate({
        where: { type: "commission", status: "completed" },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: { type: "payment", status: "completed" },
        _sum: { amount: true },
      }),
      // Money actually returned, not money promised. A refund ledger row is
      // written `pending` and can never be flipped (transactions is
      // UPDATE-revoked), so the state lives on the payment — see
      // MIGRATION_PLAN_B.md §4. The `reversalOfId: null` branch is legacy
      // refunds, which had no confirmation step.
      tx.payment.aggregate({
        where: {
          amount: { lt: 0 },
          OR: [{ reversalOfId: null }, { refundConfirmedAt: { not: null } }],
        },
        _sum: { amount: true },
      }),
      tx.payout.aggregate({
        where: { status: "pending" },
        _sum: { netPayable: true },
        _count: { _all: true },
      }),
      tx.expense.aggregate({ _sum: { amount: true } }),
    ]);

    return {
      platformCommission: commission._sum.amount ?? 0,
      grossLessonRevenue: grossRevenue._sum.amount ?? 0,
      totalRefunds: Math.abs(refunds._sum.amount ?? 0),
      pendingPayouts: {
        count: pendingPayouts._count._all,
        amount: pendingPayouts._sum.netPayable ?? 0,
      },
      totalExpenses: expenses._sum.amount ?? 0,
    };
  });
}
