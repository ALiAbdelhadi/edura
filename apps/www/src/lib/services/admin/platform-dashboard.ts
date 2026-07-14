import { platformDb, type TenantTx } from "@/lib/db/scope";


export function platformKpis() {
  return platformDb(async (tx) => {
    const [
      centersActive,
      centersPending,
      teachers,
      students,
      parents,
      pendingTeachers,
    ] = await Promise.all([
      tx.center.count({ where: { status: "active" } }),
      tx.center.count({ where: { status: "pending" } }),
      tx.user.count({ where: { role: "teacher", status: "active" } }),
      tx.user.count({ where: { role: "student" } }),
      tx.user.count({ where: { role: "parent" } }),
      tx.user.count({ where: { role: "teacher", status: "pending" } }),
    ]);

    const commissionAgg = await tx.transaction.aggregate({
      where: { type: "commission", status: "completed" },
      _sum: { amount: true },
    });
    const lessonRevenueAgg = await tx.transaction.aggregate({
      where: { type: "payment", status: "completed" },
      _sum: { amount: true },
    });
    const lessonsCompleted = await tx.session.count({ where: { status: "completed" } });

    return {
      centers: { active: centersActive, pending: centersPending },
      users: { teachers, students, parents },
      pendingRegistrations: centersPending + pendingTeachers,
      platformRevenue: commissionAgg._sum.amount ?? 0,
      grossLessonRevenue: lessonRevenueAgg._sum.amount ?? 0,
      lessonsCompleted,
    };
  });
}

type Bucket = { period: string; value: number };

export function revenueChart(period: "weekly" | "monthly" = "monthly") {
  const trunc = period === "weekly" ? "week" : "month";
  return platformDb(async (tx) => {
    const rows = await (tx as TenantTx).$queryRawUnsafe<{ bucket: Date; total: bigint }[]>(
      `SELECT date_trunc('${trunc}', created_at) AS bucket, COALESCE(SUM(amount),0) AS total
       FROM transactions
       WHERE type = 'commission' AND status = 'completed'
       GROUP BY 1 ORDER BY 1 DESC LIMIT 24`,
    );
    const series: Bucket[] = rows
      .map((r) => ({ period: r.bucket.toISOString().slice(0, 10), value: Number(r.total) }))
      .reverse();
    return { period, series };
  });
}

export function userGrowthChart() {
  return platformDb(async (tx) => {
    const rows = await (tx as TenantTx).$queryRawUnsafe<{ bucket: Date; role: string; total: bigint }[]>(
      `SELECT date_trunc('month', created_at) AS bucket, role, COUNT(*) AS total
       FROM users
       WHERE deleted_at IS NULL
       GROUP BY 1, 2 ORDER BY 1 DESC LIMIT 120`,
    );
    const byPeriod = new Map<string, { period: string; counts: Record<string, number> }>();
    for (const r of rows) {
      const key = r.bucket.toISOString().slice(0, 10);
      const b = byPeriod.get(key) ?? { period: key, counts: {} };
      b.counts[r.role] = Number(r.total);
      byPeriod.set(key, b);
    }
    const series = [...byPeriod.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((b) => ({ period: b.period, ...b.counts }));
    return { series };
  });
}
