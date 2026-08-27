/* eslint-disable no-console */
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

async function collect(): Promise<Drift[]> {
  return withPlatformContext(async (tx) => {
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
