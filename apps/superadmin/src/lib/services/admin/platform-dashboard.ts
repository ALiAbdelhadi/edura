import { platformDb, type TenantTx } from "@/lib/db/scope";

/* ── The decision queue (اليوم) ────────────────────────────────────────────────

   READ-ONLY aggregation. Nothing here mutates; the super admin sees all money and
   moves none (see center-oversight.ts for the same boundary stated as an import
   list).

   Every figure below is derived from a table that already exists. That constraint
   is not incidental — the design brief's third metric card was «فروق في مطابقة
   الكاش» (cash-reconciliation differences), and NO such concept exists in the
   schema: 70 models, none for reconciliation discrepancies. Rendering it would
   have failed the one test the constitution exists to enforce — "no screen implies
   a capability the system does not have".

   What replaced it is a real blocking condition with the same meaning. settlePayout
   settles with an H2 CONDITIONAL DECREMENT (`updateMany where balance >= net`), so a
   payout whose beneficiary wallet does not cover the net DOES NOT SILENTLY PASS — it
   throws and rolls the whole settlement back. That is a payout which genuinely
   cannot be disbursed, it is knowable before the operator arms the button, and it
   carries the same «يوقف الصرف» semantics the card was drawn to carry. */

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
        where: { status: "pending" },
        _count: { _all: true },
        _sum: { netPayable: true },
      }),

      // The oldest waiting request — "12 pending" is a number, "the oldest is 3
      // days old, and it belongs to this person" is a decision (D-026).
      tx.payout.findFirst({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, beneficiaryId: true, beneficiaryType: true },
      }),

      tx.center.count({ where: { status: "pending" } }),
      tx.user.count({ where: { role: "teacher", status: "pending" } }),

      // Held funds — money on the platform's books that is already spoken for.
      tx.payout.aggregate({
        where: { status: { in: ["pending", "approved"] } },
        _sum: { netPayable: true },
      }),
      tx.studentProfile.aggregate({ _sum: { walletBalance: true } }),
      tx.transaction.aggregate({
        where: { type: "refund", status: "pending" },
        _sum: { amount: true },
      }),

      /* Payouts the wallet cannot cover. This is the H2 floor read forward: the
         same comparison settlePayout makes conditionally, made visible before the
         commit instead of surfacing as a failed write afterwards. */
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

      /* The 15-day platform ledger: gross lesson revenue and the commission taken
         from it, per day, as ONE row per day so the overlay chart never has to
         reconcile two differently-shaped series. */
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

      /* آخر ما كُتب في الدفتر. The actor is resolved from the audit row that
         accompanies the write; where there is none the write was automated, and
         the honest value is «النظام» — never a blank (constitution §1). */
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

    // Name the oldest request's beneficiary — the card's row-3 fact is useless
    // without it ("أقدم طلب: ٣ أيام — أ. شريف الجندي").
    let oldestBeneficiary: string | null = null;
    if (oldestPending) {
      oldestBeneficiary =
        oldestPending.beneficiaryType === "teacher"
          ? ((
              await tx.user.findUnique({
                where: { id: oldestPending.beneficiaryId },
                select: { name: true },
              })
            )?.name ?? null)
          : ((
              await tx.center.findUnique({
                where: { id: oldestPending.beneficiaryId },
                select: { name: true },
              })
            )?.name ?? null);
    }

    const short = underfunded[0] ?? { count: 0n, shortfall: 0n };
    const reserved = reservedForPayouts._sum.netPayable ?? 0;
    const wallets = studentWallets._sum.walletBalance ?? 0;
    const refunds = refundsInFlight._sum.amount ?? 0;

    return {
      payouts: {
        count: pendingPayouts._count._all,
        total: pendingPayouts._sum.netPayable ?? 0,
        oldestAt: oldestPending?.createdAt.toISOString() ?? null,
        oldestBeneficiary,
      },
      registrations: {
        // Kept SEPARATE, not pre-summed: the card's fact line reads «سنتران
        // ومدرّسة», which needs the composition and Arabic dual agreement.
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
        day: r.day.toISOString().slice(0, 10),
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
    const rows = await (tx as TenantTx).$queryRaw<{ bucket: Date; total: bigint }[]>`
      SELECT date_trunc(${trunc}, created_at) AS bucket, COALESCE(SUM(amount),0) AS total
       FROM transactions
       WHERE type = 'commission' AND status = 'completed'
       GROUP BY 1 ORDER BY 1 DESC LIMIT 24`;
    const series: Bucket[] = rows
      .map((r) => ({ period: r.bucket.toISOString().slice(0, 10), value: Number(r.total) }))
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
