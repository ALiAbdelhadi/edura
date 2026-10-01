import { platformDb, type TenantTx } from "../../db/scope";
import { toDateKey } from "../../lib/date-key";
import { NotFoundError } from "../../errors/classes";

function dateWhere(from?: string, to?: string) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from) createdAt.gte = new Date(from);
  if (to) createdAt.lte = new Date(to);
  return Object.keys(createdAt).length ? { createdAt } : {};
}

const TRUNC: Record<string, string> = {
  daily: "day",
  monthly: "month",
  yearly: "year",
};

export function revenueReport(
  period: "daily" | "monthly" | "yearly" = "monthly",
) {
  const trunc = TRUNC[period] ?? "month";
  return platformDb(async (tx) => {
    const rows = await (tx as TenantTx).$queryRaw<
      { bucket: Date; type: string; total: bigint }[]
    >`
      SELECT date_trunc(${trunc}, created_at) AS bucket, type, COALESCE(SUM(amount),0) AS total
       FROM transactions WHERE status = 'completed'
       GROUP BY 1, 2 ORDER BY 1 DESC LIMIT 300`;
    const byPeriod = new Map<
      string,
      {
        period: string;
        grossRevenue: number;
        platformCommission: number;
        payouts: number;
        refunds: number;
      }
    >();
    for (const r of rows) {
      const key = toDateKey(r.bucket);
      const b = byPeriod.get(key) ?? {
        period: key,
        grossRevenue: 0,
        platformCommission: 0,
        payouts: 0,
        refunds: 0,
      };
      const v = Number(r.total);
      if (r.type === "payment") b.grossRevenue += v;
      else if (r.type === "commission") b.platformCommission += v;
      else if (r.type === "payout") b.payouts += v;
      else if (r.type === "refund") b.refunds += v;
      byPeriod.set(key, b);
    }
    return {
      period,
      series: [...byPeriod.values()].sort((a, b) =>
        a.period.localeCompare(b.period),
      ),
    };
  });
}

export function teacherStatement(
  teacherUserId: string,
  from?: string,
  to?: string,
) {
  return platformDb(async (tx) => {
    const teacher = await tx.user.findUnique({
      where: { id: teacherUserId },
      select: { id: true, name: true },
    });
    if (!teacher) throw new NotFoundError("Teacher not found");
    const profile = await tx.teacherProfile.findUnique({
      where: { userId: teacherUserId },
      select: { walletBalance: true },
    });

    const range = dateWhere(from, to);
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const [grossRows, commission, payouts] = await Promise.all([
      // transactions.lesson_id has no Prisma relation (polymorphic-style bare
      // column), and materialising every session id of a teacher into an IN
      // clause is an unbounded read that grows forever (M-16). One JOIN
      // aggregate keeps the exact same semantics in a single bounded query.
      // Refunds are subtracted here for the same reason they are in
      // `teacherStatementAmounts` — the two derivations must not drift.
      (tx as TenantTx).$queryRaw<{ gross: bigint }[]>`
        SELECT COALESCE(SUM(CASE WHEN t.type = 'refund' THEN -t.amount ELSE t.amount END), 0) AS gross
          FROM transactions t
          JOIN sessions s ON s.id = t.lesson_id
         WHERE s.teacher_id = ${teacherUserId}::uuid
           AND t.type IN ('payment', 'refund')
           AND (${fromDate}::timestamptz IS NULL OR t.created_at >= ${fromDate}::timestamptz)
           AND (${toDate}::timestamptz IS NULL OR t.created_at <= ${toDate}::timestamptz)`,
      tx.transaction.aggregate({
        where: { fromEntityId: teacherUserId, type: "commission", ...range },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: { toEntityId: teacherUserId, type: "payout", ...range },
        _sum: { amount: true },
      }),
    ]);
    return {
      teacher: { id: teacher.id, name: teacher.name },
      period: { from: from ?? null, to: to ?? null },
      grossLessonRevenue: Number(grossRows[0]?.gross ?? 0),
      platformCommission: commission._sum.amount ?? 0,
      paidOut: payouts._sum.amount ?? 0,
      walletBalance: profile?.walletBalance ?? 0,
    };
  });
}

export function centerStatement(centerId: string, from?: string, to?: string) {
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { id: true, name: true, walletBalance: true },
    });
    if (!center) throw new NotFoundError("Center not found");
    const range = dateWhere(from, to);
    const [gross, refunded, commission, payouts, expenses] = await Promise.all([
      tx.transaction.aggregate({
        where: { centerId, type: "payment", ...range },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: { centerId, type: "refund", ...range },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: { fromEntityId: centerId, type: "commission", ...range },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: { toEntityId: centerId, type: "payout", ...range },
        _sum: { amount: true },
      }),
      tx.expense.aggregate({
        where: {
          centerId,
          ...(from || to ? { expenseDate: dateWhere(from, to).createdAt } : {}),
        },
        _sum: { amount: true },
      }),
    ]);
    return {
      center: { id: center.id, name: center.name },
      period: { from: from ?? null, to: to ?? null },
      grossLessonRevenue: (gross._sum.amount ?? 0) - (refunded._sum.amount ?? 0),
      platformCommission: commission._sum.amount ?? 0,
      paidOut: payouts._sum.amount ?? 0,
      expenses: expenses._sum.amount ?? 0,
      walletBalance: center.walletBalance,
    };
  });
}

/**
 * `count`/`total` are the money that has actually GONE BACK, and the rows are
 * the full ledger trail beside it.
 *
 * Under Option B a refund is armed as an obligation and confirmed separately,
 * and the confirmation cannot be a status flip — `transactions` has UPDATE
 * revoked, so a refund ledger row stays `pending` for the life of the row even
 * after the family has been paid (REFUND_DECISION.md / MIGRATION_PLAN_B.md §4).
 * So the state is read from `payments.refund_confirmed_at`, never from
 * `transactions.status`. Aggregating every `type:"refund"` row, as this did,
 * books an unpaid promise as a paid refund — the exact failure Option B exists
 * to prevent.
 *
 * `reversal_of_id IS NULL` is the legacy branch: refunds recorded before the
 * channel work carried no confirmation step, so they count as paid, which is
 * what they were.
 */
export function refundsReport(from?: string, to?: string) {
  return platformDb(async (tx) => {
    const range = dateWhere(from, to);
    const paymentRange = from || to ? { paidAt: dateWhere(from, to).createdAt } : {};
    const [rows, paid, awaiting] = await Promise.all([
      tx.transaction.findMany({
        where: { type: "refund", ...range },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      tx.payment.aggregate({
        where: {
          amount: { lt: 0 },
          OR: [{ reversalOfId: null }, { refundConfirmedAt: { not: null } }],
          ...paymentRange,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      tx.payment.aggregate({
        where: { reversalOfId: { not: null }, refundConfirmedAt: null, ...paymentRange },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    return {
      period: { from: from ?? null, to: to ?? null },
      count: paid._count._all,
      total: Math.abs(paid._sum.amount ?? 0),
      awaiting: {
        count: awaiting._count._all,
        total: Math.abs(awaiting._sum.amount ?? 0),
      },
      refunds: rows,
    };
  });
}

export function trialBalance(from?: string, to?: string) {
  return platformDb(async (tx) => {
    const range = dateWhere(from, to);
    const byType = await tx.transaction.groupBy({
      by: ["type"],
      where: { status: "completed", ...range },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const lines = byType.map((r) => ({
      type: r.type,
      count: r._count._all,
      total: r._sum.amount ?? 0,
    }));
    const get = (t: string) => lines.find((l) => l.type === t)?.total ?? 0;
    const platformNet = get("commission") - get("payout") - get("refund");
    return {
      period: { from: from ?? null, to: to ?? null },
      lines,
      platformNet,
    };
  });
}

export function financeAlerts() {
  return platformDb(async (tx) => {
    const [
      pendingPayouts,
      negativeTeacherWallets,
      negativeCenterWallets,
      centersInCreditArrears,
      largeRefunds,
    ] = await Promise.all([
      tx.payout.aggregate({
        where: { status: "pending" },
        _count: { _all: true },
        _sum: { netPayable: true },
      }),
      tx.teacherProfile.count({ where: { walletBalance: { lt: 0 } } }),
      tx.center.count({ where: { walletBalance: { lt: 0 } } }),
      tx.center.count({ where: { creditBalance: { lt: 0 } } }),
      tx.transaction.count({
        where: { type: "refund", amount: { gt: 5000000 } },
      }),
    ]);
    const alerts: {
      level: "info" | "warning";
      code: string;
      message: string;
      value?: number;
    }[] = [];
    if (pendingPayouts._count._all > 0) {
      alerts.push({
        level: "warning",
        code: "pending_payouts",
        message: `${pendingPayouts._count._all} payouts awaiting approval`,
        value: pendingPayouts._sum.netPayable ?? 0,
      });
    }
    if (negativeTeacherWallets > 0)
      alerts.push({
        level: "warning",
        code: "negative_teacher_wallets",
        message: `${negativeTeacherWallets} teacher wallets are negative`,
        value: negativeTeacherWallets,
      });
    if (negativeCenterWallets > 0)
      alerts.push({
        level: "warning",
        code: "negative_center_wallets",
        message: `${negativeCenterWallets} center wallets are negative`,
        value: negativeCenterWallets,
      });
    if (centersInCreditArrears > 0)
      alerts.push({
        level: "warning",
        code: "centers_credit_arrears",
        message: `${centersInCreditArrears} centers owe the platform (credit arrears)`,
        value: centersInCreditArrears,
      });
    if (largeRefunds > 0)
      alerts.push({
        level: "info",
        code: "large_refunds",
        message: `${largeRefunds} refunds over 50,000 EGP`,
        value: largeRefunds,
      });
    return { alerts };
  });
}

