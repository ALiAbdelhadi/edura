import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { hardenNeonWebSockets } from "../src/neon-ws.ts";
import { config } from "dotenv";
import { assertDbEnv } from "./db-guard.ts";
config();
// Normalize a dropped socket into a real Error — see src/neon-ws.ts.
hardenNeonWebSockets();
neonConfig.webSocketConstructor = ws;

const TXN = Number(process.argv[2] ?? 1_000_000);
const ATTN = Number(process.argv[3] ?? 1_000_000);
const BATCH = 100_000;

const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;
const ms = (t) => `${t.toFixed(1)}ms`;

function planTime(rows) {
  const text = rows.map((r) => r["QUERY PLAN"]).join("\n");
  const m = text.match(/Execution Time: ([\d.]+) ms/);
  const idx = /Index (Only )?Scan|Bitmap Index Scan/.test(text);
  const seq = /Seq Scan/.test(text);
  return { time: m ? Number(m[1]) : null, usesIndex: idx, seqScan: seq, text };
}

async function explain(label, sql) {
  const rows = await q(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  const p = planTime(rows);
  console.log(
    `  ${label.padEnd(42)} ${p.time != null ? ms(p.time).padStart(10) : "     n/a"}  ${p.usesIndex ? "INDEX" : p.seqScan ? "SEQSCAN" : "-"}`,
  );
  return p;
}

async function main() {
  // By DEFAULT this writes one million `transactions` rows and one million
  // `attendance_records`. `transactions` is append-only (immutableExtension +
  // a DB-level REVOKE), so on the wrong database this is not merely noisy — it
  // is UNDOABLE. Dev or test only, proven by the label inside the database.
  await assertDbEnv(["dev", "test"], { intent: "scale-load-test" });

  console.log(`\n=== Scale load test: ${TXN.toLocaleString()} txns, ${ATTN.toLocaleString()} attendance ===`);
  await pool.query(`SELECT set_config('app.bypass_rls','on',false)`);

  const baseTxn = Number((await q(`SELECT count(*) c FROM transactions`))[0].c);
  const centers = await q(`SELECT id FROM centers LIMIT 20`);
  const cids = centers.map((r) => r.id);
  const users = await q(`SELECT id FROM users LIMIT 50`);
  const uids = users.map((r) => r.id);
  if (cids.length === 0 || uids.length === 0) throw new Error("need seed centers+users first");

  console.log(`\nSeeding ${TXN.toLocaleString()} transactions (batched)…`);
  const t0 = Date.now();
  for (let off = 0; off < TXN; off += BATCH) {
    const n = Math.min(BATCH, TXN - off);
    await pool.query(
      `INSERT INTO transactions (ref_number, type, amount, status, from_entity_id, center_id, created_at, gateway_ref)
       SELECT 'LOAD-'||($1::bigint + g),
              (ARRAY['payment','commission','payout','refund','adjustment'])[1+(g%5)]::transaction_type,
              1000+(g%5000000),
              (ARRAY['completed','pending','failed','reversed'])[1+(g%4)]::transaction_status,
              ($2::uuid[])[1+(g % array_length($2::uuid[],1))],
              ($3::uuid[])[1+(g % array_length($3::uuid[],1))],
              now() - ((g%525600)||' minutes')::interval,
              'LOADTEST'
       FROM generate_series($4::bigint, $4::bigint + $5 - 1) g`,
      [baseTxn + off, uids, cids, off, n],
    );
    process.stdout.write(`\r  ${(off + n).toLocaleString()} / ${TXN.toLocaleString()}`);
  }
  console.log(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const sessions = await q(`SELECT s.id sid, c.center_id cid FROM sessions s JOIN courses c ON c.id=s.course_id LIMIT 200`);
  if (sessions.length > 0 && ATTN > 0) {
    console.log(`\nSeeding ${ATTN.toLocaleString()} attendance rows…`);
    const sids = sessions.map((r) => r.sid);
    const scids = sessions.map((r) => r.cid);
    const a0 = Date.now();
    for (let off = 0; off < ATTN; off += BATCH) {
      const n = Math.min(BATCH, ATTN - off);
      await pool.query(
        `INSERT INTO attendance_records (session_id, student_id, course_id, center_id, status, marked_by, synced, notes, created_at, updated_at)
         SELECT ($1::uuid[])[1+(g % array_length($1::uuid[],1))],
                gen_random_uuid(),
                (SELECT course_id FROM sessions WHERE id = ($1::uuid[])[1+(g % array_length($1::uuid[],1))]),
                ($2::uuid[])[1+(g % array_length($2::uuid[],1))],
                (ARRAY['present','absent','late','excused'])[1+(g%4)]::attendance_status,
                ($3::uuid[])[1+(g % array_length($3::uuid[],1))],
                true, 'LOADTEST',
                now() - ((g%525600)||' minutes')::interval,
                now() - ((g%525600)||' minutes')::interval
         FROM generate_series($4::bigint, $4::bigint + $5 - 1) g`,
        [sids, scids, uids, off, n],
      );
      process.stdout.write(`\r  ${(off + n).toLocaleString()} / ${ATTN.toLocaleString()}`);
    }
    console.log(`\n  done in ${((Date.now() - a0) / 1000).toFixed(1)}s`);
  }

  console.log(`\nANALYZE…`);
  await pool.query(`ANALYZE transactions, attendance_records`);
  const total = Number((await q(`SELECT count(*) c FROM transactions`))[0].c);
  console.log(`  transactions now: ${total.toLocaleString()}`);

  const anyCenter = cids[0];
  const ledgerSql = `SELECT * FROM transactions WHERE type='commission' AND status='completed' ORDER BY created_at DESC LIMIT 50`;
  const dashSql = `SELECT type, sum(amount) FROM transactions WHERE status='completed' GROUP BY type`;
  const centerSql = `SELECT * FROM transactions WHERE center_id='${anyCenter}' ORDER BY created_at DESC LIMIT 50`;
  const trendSql = `SELECT date_trunc('month',created_at) b, sum(amount) FROM transactions WHERE type='commission' AND status='completed' GROUP BY 1 ORDER BY 1 DESC LIMIT 24`;

  console.log(`\n--- WITH indexes (current schema) ---`);
  const withIdx = {
    ledger: await explain("accountant ledger (type+status, newest)", ledgerSql),
    dash: await explain("dashboard aggregate (sum by type)", dashSql),
    center: await explain("center ledger (center_id, newest)", centerSql),
    trend: await explain("revenue trend (date_trunc month)", trendSql),
  };

  console.log(`\n--- WITHOUT the composite index (dropped) ---`);
  await pool.query(`DROP INDEX IF EXISTS transactions_type_status_created_idx`);
  await pool.query(`ANALYZE transactions`);
  const noIdx = {
    ledger: await explain("accountant ledger", ledgerSql),
    trend: await explain("revenue trend", trendSql),
  };
  await pool.query(`CREATE INDEX IF NOT EXISTS transactions_type_status_created_idx ON transactions (type, status, created_at DESC)`);
  console.log(`  (composite index recreated)`);

  console.log(`\n=== RESULT ===`);
  const target = 500;
  const line = (name, w, wo) =>
    console.log(`  ${name.padEnd(26)} with:${ms(w.time ?? 0).padStart(9)} (${w.usesIndex ? "index" : "seq"})   without:${wo ? ms(wo.time ?? 0).padStart(9) + (wo.seqScan ? " (seq)" : "") : "  —"}`);
  line("accountant ledger", withIdx.ledger, noIdx.ledger);
  line("revenue trend", withIdx.trend, noIdx.trend);
  line("dashboard aggregate", withIdx.dash, null);
  line("center ledger", withIdx.center, null);
  const worst = Math.max(withIdx.ledger.time ?? 0, withIdx.center.time ?? 0);
  console.log(`\n  §9.1 p95 target < ${target}ms  →  worst indexed list query: ${ms(worst)}  ${worst < target ? "✅ PASS" : "⚠️ REVIEW"}`);

  console.log(`\nCleanup…`);
  await pool.query(`DELETE FROM attendance_records WHERE notes='LOADTEST'`);
  let deleted = 0;
  do {
    const r = await pool.query(`DELETE FROM transactions WHERE ctid IN (SELECT ctid FROM transactions WHERE gateway_ref='LOADTEST' LIMIT 200000)`);
    deleted = r.rowCount;
    process.stdout.write(`\r  deleted batch (${deleted})`);
  } while (deleted > 0);
  const left = Number((await q(`SELECT count(*) c FROM transactions WHERE gateway_ref='LOADTEST'`))[0].c);
  const finalTotal = Number((await q(`SELECT count(*) c FROM transactions`))[0].c);
  console.log(`\n  loadtest rows left: ${left}; transactions back to ${finalTotal.toLocaleString()} (baseline ${baseTxn})`);

  await pool.end();
}
main().catch(async (e) => { console.error("\nFAILED:", e.message); await pool.end(); process.exit(1); });
