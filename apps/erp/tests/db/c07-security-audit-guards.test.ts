// Migrations 76–78 (SECURITY_AUDIT.md Phase 3) add objects Prisma cannot model
// and `prisma migrate dev` will offer to drop. Like c04/c05/c06 this asserts
// them by DEFINITION so a rebuilt-without-WHERE index is a red test.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

const pool = testPool();
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

async function main() {
  console.log("C-7 security-audit Phase 3 guards");
  const c = await pool.connect();
  try {
    const enums = (await c.query(`
      SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname IN ('payment_intent_status','notification_type')`)).rows as { typname: string; enumlabel: string }[];
    assert(enums.some((r) => r.typname === "payment_intent_status" && r.enumlabel === "needs_review"), "migration 76: payment_intent_status has needs_review (H-04)");
    assert(enums.some((r) => r.typname === "notification_type" && r.enumlabel === "payout_paid"), "migration 78: notification_type has payout_paid (M-03)");

    const grants = (await c.query(`
      SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) privs
        FROM information_schema.role_table_grants
       WHERE grantee='edura_app' AND table_name IN ('wallet_ledger','parent_wallet_ledger','center_wallet_ledger','payments','email_change_requests')
       GROUP BY table_name`)).rows as { table_name: string; privs: string }[];
    const privs = (t: string) => grants.find((g) => g.table_name === t)?.privs ?? "(none)";
    for (const t of ["wallet_ledger", "parent_wallet_ledger", "center_wallet_ledger"]) {
      assert(privs(t) === "INSERT,SELECT", `migration 77: ${t} is append-only for edura_app (${privs(t)})`);
    }
    assert(privs("payments") === "INSERT,SELECT,UPDATE", `migration 77: payments has no DELETE (${privs("payments")})`);
    assert(privs("email_change_requests") === "DELETE,INSERT,SELECT,UPDATE", `migration 78: email_change_requests fully granted (${privs("email_change_requests")})`);

    const cols = (await c.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name='payouts'
         AND column_name IN ('external_ref','paid_by','generated_by')`)).rows;
    assert(cols.length === 3, `migration 78: payouts has external_ref, paid_by, generated_by (got ${cols.length})`);

    const idx = (await c.query(`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('payouts_external_ref_unique','audit_logs_view_as_jti','email_change_requests_token_hash_key')`)).rows as { indexname: string; indexdef: string }[];
    const def = (n: string) => norm(idx.find((r) => r.indexname === n)?.indexdef ?? "");
    assert(def("payouts_external_ref_unique").includes("unique") && def("payouts_external_ref_unique").includes("(external_ref)") && def("payouts_external_ref_unique").includes("external_ref is not null"),
      "payouts_external_ref_unique is UNIQUE (external_ref) WHERE external_ref IS NOT NULL — one transfer never pays two payouts");
    assert(def("audit_logs_view_as_jti").includes("unique") && def("audit_logs_view_as_jti").includes("after_state ->> 'jti'") && def("audit_logs_view_as_jti").includes("action = 'user.view_as_claimed'"),
      "audit_logs_view_as_jti is UNIQUE on (after_state->>'jti') WHERE action = 'user.view_as_claimed' — L-05 replay guard");
    assert(def("email_change_requests_token_hash_key").includes("unique"), "email_change_requests.token_hash is unique — one request per token");

    const fk = (await c.query(`
      SELECT pg_get_constraintdef(oid) def FROM pg_constraint
       WHERE conrelid = 'email_change_requests'::regclass AND contype = 'f'`)).rows as { def: string }[];
    assert(fk.some((r) => /users\(id\) on delete cascade/i.test(r.def)), "email_change_requests.user_id cascades with the user");

    // The L-05 guard bites: two audit rows with one jti cannot both exist.
    await c.query("BEGIN");
    let unique = false;
    try {
      const jti = "c07-" + Math.random().toString(36).slice(2);
      await c.query(`INSERT INTO audit_logs (action, target_type, after_state) VALUES ('user.view_as_claimed','user', $1::jsonb)`, [JSON.stringify({ jti })]);
      await c.query(`INSERT INTO audit_logs (action, target_type, after_state) VALUES ('user.view_as_claimed','user', $1::jsonb)`, [JSON.stringify({ jti })]);
    } catch (e) {
      unique = /audit_logs_view_as_jti/.test((e as Error).message);
    } finally {
      await c.query("ROLLBACK");
    }
    assert(unique, "a second view-as claim row for the same jti is refused by the index");
  } finally {
    c.release();
    await pool.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
assertDbEnv(["test"], { intent: "suite c07-security-audit-guards.test.ts" }).then(main).catch((e) => { console.error(e); process.exit(1); });
