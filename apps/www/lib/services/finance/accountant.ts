import { platformDb } from "@/lib/db/scope";
import type { Prisma } from "@repo/database";

/**
 * Accountant finance surface (PRD §4.3). Reads the platform-wide immutable
 * transaction ledger produced by the distribution engine, plus operational
 * payments/expenses across ALL centers. Accessible to accountant + super_admin.
 * Runs under platform context (these roles have no single center scope).
 */

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
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(filters.limit ?? "50", 10) || 50));

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

/** Platform finance KPIs across all centers. */
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
      tx.transaction.aggregate({
        where: { type: "refund" },
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
      totalRefunds: refunds._sum.amount ?? 0,
      pendingPayouts: {
        count: pendingPayouts._count._all,
        amount: pendingPayouts._sum.netPayable ?? 0,
      },
      totalExpenses: expenses._sum.amount ?? 0,
    };
  });
}
