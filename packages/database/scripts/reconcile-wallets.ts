/* eslint-disable no-console */
/**
 * ============================================================================
 * RECONCILE WALLETS — re-derive the cached balance from the ledger
 * ============================================================================
 * `student_profiles.wallet_balance` and `parent_profiles.wallet_balance` are
 * CACHES. The append-only ledgers are the truth, and the invariant the money
 * story rests on is that all three agree:
 *
 *     cached  ==  SUM(delta)  ==  the newest row's balanceAfter
 *
 * `reconcileWallet()` in server-core CHECKS that invariant and the wallet
 * screen shows a red banner when it fails — but nothing in the repo could ever
 * REPAIR it, so the only answer to a drifted cache was to edit a money column
 * by hand. This is that repair, written once, so nobody has to.
 *
 *     bun run db:reconcile-wallets            # read-only; prints the drift
 *     bun run db:reconcile-wallets --write
 *
 * ── WHAT IT WILL AND WILL NOT DO ────────────────────────────────────────────
 *
 * It writes the CACHE ONLY, and only to the figure the ledger already states.
 * It cannot invent money: it never inserts, edits or deletes a ledger row, so
 * the sum it copies is one somebody else already committed. A cache that
 * disagrees with its ledger is not a second opinion about a balance — it is
 * simply stale, and the ledger is what every audit reads.
 *
 * It REFUSES PRODUCTION. Not because the arithmetic would differ there, but
 * because a drifted cache in production means a writer somewhere skipped the
 * primitive, and silently papering over that hides the bug while leaving it
 * live. On production, find the writer first. `assertNotProduction` is the same
 * guard `db:wipe` uses.
 *
 * IDEMPOTENT: it only touches rows where the cache and the ledger disagree, so
 * a second run reports zero and writes nothing.
 *
 * ── THE MISMATCH IT REFUSES TO FIX ──────────────────────────────────────────
 *
 * If SUM(delta) and the newest `balanceAfter` disagree with EACH OTHER, the
 * ledger is internally inconsistent and no cache value is correct. That is a
 * real corruption, not a stale cache, so the row is reported and skipped —
 * repairing it would need a decision about which entry is wrong, and that is a
 * person's decision, not a script's.
 */
import "./load-env";
import { withPlatformContext } from "../src/index";
import { assertNotProduction } from "./db-guard";

const write = process.argv.includes("--write");

type Drift = {
  kind: "student" | "parent";
  userId: string;
  label: string;
  cached: number;
  ledgerSum: number;
  newest: number;
};

const egp = (piasters: number) => (piasters / 100).toFixed(2);

/**
 * ONE GROUPED QUERY PER LEDGER, not a per-wallet loop.
 *
 * The first version aggregated inside a `for` over every profile — three round
 * trips each, ~250 against a remote Neon, and the transaction timed out at 20s
 * before it reached the parent wallets. The comparison is a GROUP BY; asking
 * the database to do it is both correct and the only version that finishes.
 *
 * Both ledgers key on the USER id (`wallet_ledger.student_id` and
 * `parent_wallet_ledger.parent_id` are users ids — neither declares an FK
 * relation, and joining them to `*_profiles.id` silently matches nothing).
 * Only wallets that HAVE entries are considered: a profile with no ledger has
 * nothing to be reconciled against.
 */
async function collect(): Promise<Drift[]> {
  return withPlatformContext(async (tx) => {
    // M8: the tagged-template raw query, never the Unsafe string variant.
    // The SQL was always static — nothing interpolates into it — so this is
    // byte-identical in behaviour; the point is that the injection-shaped API
    // greps to ZERO in this repo (m8-no-raw-unsafe.test.ts keeps it that way).
    const rows = await tx.$queryRaw<
      {
        kind: "student" | "parent";
        user_id: string;
        label: string | null;
        cached: number;
        ledger_sum: number;
        newest: number;
      }[]
    >`
      SELECT 'student'::text AS kind, wl.student_id AS user_id, u.email AS label,
             sp.wallet_balance AS cached,
             SUM(wl.delta)::int AS ledger_sum,
             (SELECT w2.balance_after FROM wallet_ledger w2
               WHERE w2.student_id = wl.student_id
               ORDER BY w2.created_at DESC, w2.id DESC LIMIT 1)::int AS newest
        FROM wallet_ledger wl
        JOIN student_profiles sp ON sp.user_id = wl.student_id
        LEFT JOIN users u ON u.id = wl.student_id
       GROUP BY wl.student_id, u.email, sp.wallet_balance

      UNION ALL

      SELECT 'parent'::text, pl.parent_id, u.email,
             pp.wallet_balance,
             SUM(pl.delta)::int,
             (SELECT p2.balance_after FROM parent_wallet_ledger p2
               WHERE p2.parent_id = pl.parent_id
               ORDER BY p2.created_at DESC, p2.id DESC LIMIT 1)::int
        FROM parent_wallet_ledger pl
        JOIN parent_profiles pp ON pp.user_id = pl.parent_id
        LEFT JOIN users u ON u.id = pl.parent_id
       GROUP BY pl.parent_id, u.email, pp.wallet_balance
    `;

    return rows
      .map((r) => ({
        kind: r.kind,
        userId: r.user_id,
        label: r.label ?? r.user_id,
        cached: Number(r.cached),
        ledgerSum: Number(r.ledger_sum),
        newest: Number(r.newest),
      }))
      .filter((d) => d.cached !== d.ledgerSum || d.cached !== d.newest);
  });
}

async function main() {
  const env = await assertNotProduction("reconcile wallet caches");
  console.log(`Target: ${env}\n`);

  const drifts = await collect();
  if (drifts.length === 0) {
    console.log("Every wallet cache agrees with its ledger. Nothing to do.");
    return;
  }

  const repairable = drifts.filter((d) => d.ledgerSum === d.newest);
  const corrupt = drifts.filter((d) => d.ledgerSum !== d.newest);

  for (const d of repairable) {
    console.log(
      `DRIFT  ${d.kind.padEnd(7)} ${d.label}\n` +
        `       cached ${egp(d.cached)} EGP  →  ledger ${egp(d.ledgerSum)} EGP`,
    );
  }
  for (const d of corrupt) {
    console.log(
      `SKIP   ${d.kind.padEnd(7)} ${d.label}\n` +
        `       LEDGER DISAGREES WITH ITSELF: sum ${egp(d.ledgerSum)} vs newest ` +
        `balanceAfter ${egp(d.newest)}. Not a stale cache — needs a person.`,
    );
  }

  if (!write) {
    console.log(
      `\n${repairable.length} repairable, ${corrupt.length} needing a decision. ` +
        `Dry run — re-run with --write to apply.`,
    );
    return;
  }

  await withPlatformContext(async (tx) => {
    for (const d of repairable) {
      if (d.kind === "student") {
        await tx.studentProfile.update({
          where: { userId: d.userId },
          data: { walletBalance: d.ledgerSum },
        });
      } else {
        await tx.parentProfile.update({
          where: { userId: d.userId },
          data: { walletBalance: d.ledgerSum },
        });
      }
    }
  });

  console.log(
    `\nReconciled ${repairable.length} cache(s). ` +
      `${corrupt.length} left alone. No ledger row was touched.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
