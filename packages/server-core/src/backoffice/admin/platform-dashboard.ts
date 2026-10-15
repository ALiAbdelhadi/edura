import { platformDb, type TenantTx } from "../../db/scope";
import { toDateKey } from "../../lib/date-key";

export type DecisionQueue = Awaited<ReturnType<typeof decisionQueue>>;

const LEDGER_WINDOW_DAYS = 15;
const LAST_WRITES = 6;

type QueueRow = {
  payouts: { count: number; total: number | null };
  oldest: { at: string; name: string | null } | null;
  registrations: { centers: number; teachers: number };
  held: { studentWallets: number | null; refunds: number | null };
  blocked: { count: number; shortfall: number };
  ledger: { day: string; gross: number; commission: number }[];
  lastWrites: {
    id: string;
    ref: string;
    type: string;
    amount: number;
    at: string;
    actor: string | null;
    party: string | null;
  }[];
};

export function decisionQueue() {
  return platformDb(async (tx) => {
    const [row] = await tx.$queryRaw<[QueueRow]>`
      WITH pending AS (
        -- M-03: an approved payout still awaits its second person.
        SELECT count(*) AS count, sum(net_payable) AS total
          FROM payouts
         WHERE status IN ('pending', 'approved')
      ),
      oldest AS (
        -- The beneficiary's name is resolved in the same query rather than in a
        -- follow-up await: payouts.beneficiary_id is polymorphic, so Prisma cannot
        -- join it, and a second round trip to Neon costs more than this LEFT JOIN.
        SELECT p.created_at, COALESCE(u.name, c.name) AS name
          FROM payouts p
          LEFT JOIN users   u ON p.beneficiary_type = 'teacher'  AND u.id = p.beneficiary_id
          LEFT JOIN centers c ON p.beneficiary_type <> 'teacher' AND c.id = p.beneficiary_id
         WHERE p.status IN ('pending', 'approved')
         ORDER BY p.created_at ASC
         LIMIT 1
      ),
      blocked AS (
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
           AND w.wallet_balance < p.net_payable
      ),
      ledger AS (
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
      ),
      last_writes AS (
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
         LIMIT ${LAST_WRITES}
      )
      SELECT
        (SELECT json_build_object('count', count, 'total', total) FROM pending) AS payouts,
        (SELECT json_build_object(
           'at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'name', name) FROM oldest) AS oldest,
        json_build_object(
          'centers',  (SELECT count(*) FROM centers WHERE status = 'pending'),
          'teachers', (SELECT count(*) FROM users
                        WHERE deleted_at IS NULL AND role = 'teacher' AND status = 'pending')
        ) AS registrations,
        json_build_object(
          'studentWallets', (SELECT sum(wallet_balance) FROM student_profiles),
          -- This tile read transactions type:"refund", status:"pending" and was a
          -- permanent zero, because every writer set "completed". Option B makes
          -- pending real — but the ledger row STAYS pending after confirmation
          -- (transactions is UPDATE-revoked), so counting those rows would now
          -- overcount in the other direction. The obligation lives on the payment:
          -- a refund armed and not yet paid out.
          'refunds', (SELECT sum(amount) FROM payments
                       WHERE reversal_of_id IS NOT NULL AND refund_confirmed_at IS NULL)
        ) AS held,
        (SELECT json_build_object('count', count, 'shortfall', shortfall) FROM blocked) AS blocked,
        (SELECT json_agg(json_build_object(
           'day', to_char(day, 'YYYY-MM-DD'), 'gross', gross, 'commission', commission)
           ORDER BY day ASC) FROM ledger) AS ledger,
        (SELECT coalesce(json_agg(json_build_object(
           'id', id, 'ref', ref_number, 'type', type, 'amount', amount,
           'at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'actor', actor_name, 'party', center_name)
           ORDER BY created_at DESC), '[]'::json) FROM last_writes) AS "lastWrites"`;

    const centers = row.registrations.centers;
    const teachers = row.registrations.teachers;
    const reserved = row.payouts.total ?? 0;
    const wallets = row.held.studentWallets ?? 0;
    // Negative on `payments`; this is a magnitude of money owed out.
    const refunds = Math.abs(row.held.refunds ?? 0);

    return {
      payouts: {
        count: row.payouts.count,
        total: row.payouts.total ?? 0,
        oldestAt: row.oldest?.at ?? null,
        oldestBeneficiary: row.oldest?.name ?? null,
      },
      registrations: {
        centers,
        teachers,
        count: centers + teachers,
      },
      blocked: {
        count: row.blocked.count,
        shortfall: row.blocked.shortfall,
      },
      held: {
        reservedForPayouts: reserved,
        studentWallets: wallets,
        refundsInProcessing: refunds,
        total: reserved + wallets + refunds,
      },
      ledger: row.ledger.map((r) => ({
        day: r.day,
        gross: r.gross,
        commission: r.commission,
      })),
      lastWrites: row.lastWrites.map((r) => ({
        id: r.id,
        ref: r.ref,
        type: r.type,
        amount: r.amount,
        at: r.at,
        actor: r.actor, // null → the caller renders «النظام»
        party: r.party,
      })),
    };
  });
}

type KpiRow = {
  centersActive: number;
  centersPending: number;
  teachers: number;
  students: number;
  parents: number;
  pendingTeachers: number;
  commission: number | null;
  lessonRevenue: number | null;
  lessonsCompleted: number;
};

export function platformKpis() {
  return platformDb(async (tx) => {
    const [{ k }] = await tx.$queryRaw<[{ k: KpiRow }]>`
      SELECT json_build_object(
        'centersActive',    (SELECT count(*) FROM centers WHERE status = 'active'),
        'centersPending',   (SELECT count(*) FROM centers WHERE status = 'pending'),
        'teachers',         (SELECT count(*) FROM users
                              WHERE deleted_at IS NULL AND role = 'teacher' AND status = 'active'),
        'students',         (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role = 'student'),
        'parents',          (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role = 'parent'),
        'pendingTeachers',  (SELECT count(*) FROM users
                              WHERE deleted_at IS NULL AND role = 'teacher' AND status = 'pending'),
        'commission',       (SELECT sum(amount) FROM transactions
                              WHERE type = 'commission' AND status = 'completed'),
        'lessonRevenue',    (SELECT sum(amount) FROM transactions
                              WHERE type = 'payment' AND status = 'completed'),
        'lessonsCompleted', (SELECT count(*) FROM sessions WHERE status = 'completed')
      ) AS k`;

    return {
      centers: { active: k.centersActive, pending: k.centersPending },
      users: { teachers: k.teachers, students: k.students, parents: k.parents },
      pendingRegistrations: k.centersPending + k.pendingTeachers,
      platformRevenue: k.commission ?? 0,
      grossLessonRevenue: k.lessonRevenue ?? 0,
      lessonsCompleted: k.lessonsCompleted,
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
