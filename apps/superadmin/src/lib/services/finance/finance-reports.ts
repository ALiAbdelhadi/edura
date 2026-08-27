import { platformDb, type TenantTx } from "@/lib/db/scope";
import { toDateKey } from "@repo/server-core/lib/date-key";
import { NotFoundError } from "@/lib/errors/classes";

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
    const sessions = await tx.session.findMany({
      where: { teacherId: teacherUserId },
      select: { id: true },
    });
    const lessonIds = sessions.map((s) => s.id);
    const [gross, commission, payouts] = await Promise.all([
      lessonIds.length
        ? tx.transaction.aggregate({
            where: { lessonId: { in: lessonIds }, type: "payment", ...range },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: 0 } }),
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
      grossLessonRevenue: gross._sum.amount ?? 0,
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
    const [gross, commission, payouts, expenses] = await Promise.all([
      tx.transaction.aggregate({
        where: { centerId, type: "payment", ...range },
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
      grossLessonRevenue: gross._sum.amount ?? 0,
      platformCommission: commission._sum.amount ?? 0,
      paidOut: payouts._sum.amount ?? 0,
      expenses: expenses._sum.amount ?? 0,
      walletBalance: center.walletBalance,
    };
  });
}

export function refundsReport(from?: string, to?: string) {
  return platformDb(async (tx) => {
    const range = dateWhere(from, to);
    const [rows, agg] = await Promise.all([
      tx.transaction.findMany({
        where: { type: "refund", ...range },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      tx.transaction.aggregate({
        where: { type: "refund", ...range },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    return {
      period: { from: from ?? null, to: to ?? null },
      count: agg._count._all,
      total: agg._sum.amount ?? 0,
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

export function getTransaction(id: string) {
  return platformDb(async (tx) => {
    const t = await tx.transaction.findUnique({ where: { id } });
    if (!t) throw new NotFoundError("Transaction not found");
    return t;
  });
}
