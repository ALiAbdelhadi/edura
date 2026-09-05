import { testPool } from "../../../../packages/database/scripts/test-pool";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

/**
 * Migration 20260906120000_refund_foundation adds the database objects that
 * Prisma CANNOT model — two CHECKs, a plain unique index, a self-FK and a
 * cross-table FK. Migration 20260908120000_refund_multiple_partials then DROPS
 * `payments_one_refund_per_payment` and narrows `transactions_one_refund_per_payment`
 * to lesson refunds (`payment_id IS NULL`), so the H3 guard on
 * refundLessonForStudent survives while a counter receipt may carry several
 * partial refunds. `prisma migrate dev` will offer to "fix" all of it. This
 * suite is what turns accepting that offer into a red test, exactly as c04/c05
 * do for the dedupe guards — asserting ABSENCE of the dropped index as well.
 *
 * It asserts the DEFINITIONS, not merely the names: an index silently rebuilt
 * without its WHERE clause, or a CHECK relaxed to `<= amount` (which would let
 * a refund row's own refunded_total go positive), would still be present under
 * the same name and would still be wrong.
 */
const pool = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

async function main() {
  console.log("C-6 refund foundation + channel guards");
  const c = await pool.connect();
  try {
    const cols = (await c.query(`
      SELECT table_name, column_name, is_nullable, column_default
        FROM information_schema.columns
       WHERE (table_name = 'payments'
              AND column_name IN ('reversal_of_id','refunded_total','client_request_id'))
          OR (table_name = 'transactions' AND column_name = 'payment_id')`)).rows;
    assert(cols.length === 4, `all four columns exist (got ${cols.length})`);

    const refundedTotal = cols.find((r) => r.column_name === "refunded_total");
    assert(
      refundedTotal?.is_nullable === "NO" && refundedTotal?.column_default === "0",
      "refunded_total is NOT NULL DEFAULT 0 — every existing receipt starts at nothing returned",
    );

    const checks = (await c.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conname IN ('payments_reversal_is_negative','payments_refunded_within_amount')`)).rows;
    assert(checks.length === 2, `both CHECKs exist (got ${checks.length})`);

    const negative = checks.find((r) => r.conname === "payments_reversal_is_negative");
    assert(
      norm(negative?.def ?? "").includes("amount < 0"),
      "payments_reversal_is_negative still requires a reversing row to be negative",
    );

    const within = checks.find((r) => r.conname === "payments_refunded_within_amount");
    assert(
      norm(within?.def ?? "").includes("greatest(amount, 0)"),
      "payments_refunded_within_amount still bounds on GREATEST(amount,0) — so a refund row can never itself be refunded",
    );
    assert(
      norm(within?.def ?? "").includes("refunded_total >= 0"),
      "…and still has its non-negative floor",
    );

    const idx = (await c.query(`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('payments_one_refund_per_payment','payments_client_request_unique','transactions_payment_id_idx','transactions_one_refund_per_payment')`)).rows;
    assert(idx.length === 3, `exactly three of the four names exist (got ${idx.length})`);

    assert(
      !idx.some((r) => r.indexname === "payments_one_refund_per_payment"),
      "payments_one_refund_per_payment is GONE (migration 20260908120000) — a receipt may carry several partial refunds; refunded_total is the bound",
    );

    const lessonGuard = idx.find((r) => r.indexname === "transactions_one_refund_per_payment");
    const lg = norm(lessonGuard?.indexdef ?? "");
    assert(
      lg.includes("unique") && lg.includes("(reversal_of_id)") &&
        lg.includes("type = 'refund'") && lg.includes("payment_id is null"),
      "transactions_one_refund_per_payment is UNIQUE on reversal_of_id WHERE type='refund' AND payment_id IS NULL — H3's guard on the lesson refund, with counter refunds (which set payment_id) exempt",
    );

    const clientReq = idx.find((r) => r.indexname === "payments_client_request_unique");
    assert(
      norm(clientReq?.indexdef ?? "").includes("unique") &&
        norm(clientReq?.indexdef ?? "").includes("(center_id, client_request_id)"),
      "payments_client_request_unique keys on (center_id, client_request_id), mirroring payouts",
    );

    const fks = (await c.query(`
      SELECT conname, conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE contype = 'f'
         AND ((conrelid = 'payments'::regclass AND pg_get_constraintdef(oid) LIKE '%reversal_of_id%')
           OR (conrelid = 'transactions'::regclass AND pg_get_constraintdef(oid) LIKE '%payment_id%'))`)).rows;
    assert(
      fks.some((r) => r.tbl === "payments") && fks.some((r) => r.tbl === "transactions"),
      "both foreign keys survive — a refund cannot point at a receipt that does not exist",
    );

    // ---- migration 20260909120100_money_tables_revoke (M-04) --------------
    const grants = (await c.query(`
      SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
        FROM information_schema.role_table_grants
       WHERE grantee = 'edura_app'
         AND table_name IN ('wallet_ledger','parent_wallet_ledger','center_wallet_ledger','payments')
       GROUP BY table_name`)).rows as { table_name: string; privs: string }[];
    const privs = (t: string) => grants.find((g) => g.table_name === t)?.privs ?? "(none)";
    for (const ledger of ["wallet_ledger", "parent_wallet_ledger", "center_wallet_ledger"]) {
      assert(privs(ledger) === "INSERT,SELECT", `${ledger} is append-only for edura_app (got ${privs(ledger)})`);
    }
    assert(privs("payments") === "INSERT,SELECT,UPDATE", `payments cannot be DELETEd by edura_app but keeps UPDATE for refund bookkeeping (got ${privs("payments")})`);

    // ---- migration 20260907120000_refund_channel (Option B) ---------------
    const chanCols = (await c.query(`
      SELECT column_name, udt_name FROM information_schema.columns
       WHERE table_name = 'payments'
         AND column_name IN ('refund_channel','refund_external_ref','refund_confirmed_at','refund_confirmed_by')`)).rows;
    assert(chanCols.length === 4, `all four channel columns exist (got ${chanCols.length})`);
    assert(
      chanCols.find((r) => r.column_name === "refund_channel")?.udt_name === "refund_channel",
      "refund_channel is the enum type, not free text — an unknown channel cannot be written",
    );

    const enumVals = (await c.query(`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'refund_channel' ORDER BY e.enumsortorder`)).rows.map((r) => r.enumlabel);
    assert(
      enumVals.join(",") === "cash_drawer,bank_transfer,gateway,wallet",
      `the four channels, in order (got ${enumVals.join(",")})`,
    );

    const bChecks = (await c.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname IN ('payments_refund_channel_shape','payments_refund_confirmation_complete')`)).rows;
    assert(bChecks.length === 2, `both Option B CHECKs exist (got ${bChecks.length})`);

    const shape = norm(bChecks.find((r) => r.conname === "payments_refund_channel_shape")?.def ?? "");
    assert(
      shape.includes("reversal_of_id is null") && shape.includes("refund_channel is not null"),
      "payments_refund_channel_shape still ties the channel to the reversal both ways",
    );

    const complete = norm(
      bChecks.find((r) => r.conname === "payments_refund_confirmation_complete")?.def ?? "",
    );
    assert(
      complete.includes("refund_external_ref is not null"),
      "payments_refund_confirmation_complete still demands EVIDENCE — without this clause a confirmation with no proof becomes writable",
    );
    assert(
      complete.includes("refund_confirmed_by is not null"),
      "…and still demands a named actor",
    );

    const refIdx = (await c.query(`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'payments_refund_external_ref_unique'`)).rows;
    assert(refIdx.length === 1, "payments_refund_external_ref_unique exists");
    assert(
      norm(refIdx[0]?.indexdef ?? "").includes("cash_drawer"),
      "…and still excludes cash_drawer, whose voucher numbering is centre-local stationery",
    );

    // The append-only guarantee the ledger link depends on.
    const revoked = (await c.query(`
      SELECT has_table_privilege('edura_app', 'transactions', 'UPDATE') AS can_update`)).rows[0];
    assert(
      revoked?.can_update === false,
      "transactions is still UPDATE-revoked for edura_app, which is why the charge link is written at INSERT and never patched",
    );
  } finally {
    c.release();
    await pool.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite c06-refund-guards.test.ts" })
  .then(() => main())
  .catch((e) => { console.error(e); process.exit(1); });
