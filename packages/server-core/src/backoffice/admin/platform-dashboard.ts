import { platformDb, type TenantTx } from "../../db/scope";
import { toDateKey } from "../../lib/date-key";

export type DecisionQueue = Awaited<ReturnType<typeof decisionQueue>>;

const LEDGER_WINDOW_DAYS = 15;
const LAST_WRITES = 6;

export function decisionQueue() {
  return platformDb(async (tx) => {
    const db = tx as TenantTx;

    const [
      pendingPayouts,
      oldestPending,
      centersPending,
      teachersPending,
      reservedForPayouts,
      studentWallets,
      refundsInFlight,
      underfunded,
      ledger,
      lastWrites,
    ] = await Promise.all([
      tx.payout.aggregate({
        // M-03: an approved payout still awaits its second person.
        where: { status: { in: ["pending", "approved"] } },
        _count: { _all: true },
        _sum: { netPayable: true },
      }),

      // The beneficiary's name is resolved in the same query rather than in a
      // follow-up await: payouts.beneficiary_id is polymorphic, so Prisma cannot
      // join it, and a second round trip to Neon costs more than this LEFT JOIN.
      db.$queryRaw<{ id: string; created_at: Date; name: string | null }[]>`
        SELECT p.id, p.created_at, COALESCE(u.name, c.name) AS name
          FROM payouts p
          LEFT JOIN users   u ON p.beneficiary_type = 'teacher'  AND u.id = p.beneficiary_id
          LEFT JOIN centers c ON p.beneficiary_type <> 'teacher' AND c.id = p.beneficiary_id
         WHERE p.status IN ('pending', 'approved')
         ORDER BY p.created_at ASC
         LIMIT 1`,

      tx.center.count({ where: { status: "pending" } }),
      tx.user.count({ where: { role: "teacher", status: "pending" } }),

      tx.payout.aggregate({
        where: { status: { in: ["pending", "approved"] } },
        _sum: { netPayable: true },
      }),
      tx.studentProfile.aggregate({ _sum: { walletBalance: true } }),
      // This tile read `transactions type:"refund", status:"pending"` and was a
      // permanent zero, because every writer set "completed". Option B makes
      // pending real — but the ledger row STAYS pending after confirmation
      // (transactions is UPDATE-revoked), so counting those rows would now
      // overcount in the other direction. The obligation lives on the payment:
      // a refund armed and not yet paid out.
      tx.payment.aggregate({
        where: { reversalOfId: { not: null }, refundConfirmedAt: null },
        _sum: { amount: true },
      }),

      db.$queryRaw<{ count: bigint; shortfall: bigint }[]>`
        SELECT COUNT(*)                                            AS count,
               COALESCE(SUM(p.net_payable - w.wallet_balance), 0)  AS shortfall
          FROM payouts p
          JOIN LATERAL (
            SELECT CASE p.beneficiary_type
                     WHEN 'teacher' THEN (SELECT tp.wallet_balance FROM teacher_profiles tp
                                           WHERE tp.user_id = p.beneficiary_id)
                     ELSE                (SELECT c.wallet_balance  FROM centers c
                                           WHERE c.id = p.beneficiary_id)
                   END AS wallet_balance
          ) w ON TRUE
         WHERE p.status = 'pending'
           AND p.net_payable IS NOT NULL
           AND w.wallet_balance IS NOT NULL
           AND w.wallet_balance < p.net_payable`,

      db.$queryRaw<{ day: Date; gross: bigint; commission: bigint }[]>`
        SELECT d.day::date                                                        AS day,
               COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'payment'), 0)       AS gross,
               COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'commission'), 0)    AS commission
          FROM generate_series(
                 date_trunc('day', now()) - make_interval(days => ${LEDGER_WINDOW_DAYS - 1}),
                 date_trunc('day', now()),
                 '1 day'
               ) AS d(day)
          LEFT JOIN transactions t
                 ON t.created_at >= d.day
                AND t.created_at <  d.day + interval '1 day'
                AND t.status = 'completed'
                AND t.type IN ('payment', 'commission')
         GROUP BY d.day
         ORDER BY d.day ASC`,

      db.$queryRaw<
        {
          id: string;
          ref_number: string;
          type: string;
          amount: number;
          created_at: Date;
          actor_name: string | null;
          center_name: string | null;
        }[]
      >`
        SELECT t.id, t.ref_number, t.type::text AS type, t.amount, t.created_at,
               u.name AS actor_name,
               c.name AS center_name
          FROM transactions t
          LEFT JOIN LATERAL (
            SELECT a.actor_id FROM audit_logs a
             WHERE a.target_type = 'transaction' AND a.target_id = t.id
             ORDER BY a.created_at DESC LIMIT 1
          ) al ON TRUE
          LEFT JOIN users u   ON u.id = al.actor_id
          LEFT JOIN centers c ON c.id = t.center_id
         WHERE t.status = 'completed'
         ORDER BY t.created_at DESC
         LIMIT ${LAST_WRITES}`,
    ]);

    const short = underfunded[0] ?? { count: 0n, shortfall: 0n };
    const reserved = reservedForPayouts._sum.netPayable ?? 0;
    const wallets = studentWallets._sum.walletBalance ?? 0;
    // Negative on `payments`; this is a magnitude of money owed out.
    const refunds = Math.abs(refundsInFlight._sum.amount ?? 0);

    return {
      payouts: {
        count: pendingPayouts._count._all,
        total: pendingPayouts._sum.netPayable ?? 0,
        oldestAt: oldestPending[0]?.created_at.toISOString() ?? null,
        oldestBeneficiary: oldestPending[0]?.name ?? null,
      },
      registrations: {
        centers: centersPending,
        teachers: teachersPending,
        count: centersPending + teachersPending,
      },
      blocked: {
        count: Number(short.count),
        shortfall: Number(short.shortfall),
      },
      held: {
        reservedForPayouts: reserved,
        studentWallets: wallets,
        refundsInProcessing: refunds,
        total: reserved + wallets + refunds,
      },
      ledger: ledger.map((r) => ({
        day: toDateKey(r.day),
        gross: Number(r.gross),
        commission: Number(r.commission),
      })),
      lastWrites: lastWrites.map((r) => ({
        id: r.id,
        ref: r.ref_number,
        type: r.type,
        amount: Number(r.amount),
        at: r.created_at.toISOString(),
        actor: r.actor_name, // null → the caller renders «النظام»
        party: r.center_name,
      })),
    };
  });
}

export function platformKpis() {
  return platformDb(async (tx) => {
    const [
      centersActive,
      centersPending,
      teachers,
      students,
      parents,
      pendingTeachers,
      commissionAgg,
      lessonRevenueAgg,
      lessonsCompleted,
    ] = await Promise.all([
      tx.center.count({ where: { status: "active" } }),
      tx.center.count({ where: { status: "pending" } }),
      tx.user.count({ where: { role: "teacher", status: "active" } }),
      tx.user.count({ where: { role: "student" } }),
      tx.user.count({ where: { role: "parent" } }),
      tx.user.count({ where: { role: "teacher", status: "pending" } }),
      tx.transaction.aggregate({
        where: { type: "commission", status: "completed" },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: { type: "payment", status: "completed" },
        _sum: { amount: true },
      }),
      tx.session.count({ where: { status: "completed" } }),
    ]);

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
    const rows = await (tx as TenantTx).$queryRaw<{ bucket: Date; total: bigint }[]>`
      SELECT date_trunc(${trunc}, created_at) AS bucket, COALESCE(SUM(amount),0) AS total
       FROM transactions
       WHERE type = 'commission' AND status = 'completed'
       GROUP BY 1 ORDER BY 1 DESC LIMIT 24`;
    const series: Bucket[] = rows
      .map((r) => ({ period: toDateKey(r.bucket), value: Number(r.total) }))
      .reverse();
    return { period, series };
  });
}

export function userGrowthChart() {
  return platformDb(async (tx) => {
    const rows = await (tx as TenantTx).$queryRaw<{ bucket: Date; role: string; total: bigint }[]>`
      SELECT date_trunc('month', created_at) AS bucket, role, COUNT(*) AS total
       FROM users
       WHERE deleted_at IS NULL
       GROUP BY 1, 2 ORDER BY 1 DESC LIMIT 120`;
    const byPeriod = new Map<string, { period: string; counts: Record<string, number> }>();
    for (const r of rows) {
      const key = toDateKey(r.bucket);
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
