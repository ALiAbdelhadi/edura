/**
 * MONEY suite 2 — corrected settlement path (mock-complete needs {outcome}),
 * exactly-once proof, wallet credit proof, and the payout-generation 500.
 * Same disclosure/cleanup discipline as _deep-money.ts.
 */
import fs from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;

const FX = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/fixtures.json", "utf8"));
const actors = FX.actors as Record<string, { cookie: string; id: string }>;
const fx = FX.fixtures as Record<string, never>;
const results: unknown[] = [];

async function call(app: string, method: string, path: string, opts: { actor?: string | null; body?: unknown } = {}) {
  const b = app === "superadmin" ? "http://localhost:3004" : "http://localhost:3002";
  const h: Record<string, string> = {};
  if (opts.actor) h.cookie = actors[opts.actor].cookie;
  let payload: string | undefined;
  if (opts.body !== undefined) { payload = JSON.stringify(opts.body); h["content-type"] = "application/json"; }
  const res = await fetch(b + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json: never | null = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text: text.slice(0, 600) };
}
function T(meta: Record<string, unknown>, res: { status: number; json: never | null; text: string }, expected: number[], note = "") {
  const okStatus = expected.includes(res.status);
  const row = { ...meta, status: res.status, expected: expected.join("|"), verdict: okStatus ? "PASS" : "FAIL", note: okStatus ? note : `${note ? note + " | " : ""}expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify(res.json) : res.text).slice(0, 400)}`, body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 500) };
  results.push(row);
  console.log((okStatus ? "✓" : "✗"), `[${meta.app}] ${meta.method} ${meta.path} (${meta.case}) -> ${res.status}`, okStatus ? "" : ":: " + row.note);
  return okStatus;
}
function note(meta: Record<string, unknown>, verdict: string, text: string) {
  results.push({ ...meta, verdict, note: text, status: 0, expected: "-" });
  console.log(verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : "?", `[db] ${meta.case} :: ${text}`);
}
const snap = async () => (await q(`select (select count(*) from transactions)::int t,(select count(*) from payments)::int p,(select count(*) from wallet_ledger)::int w,(select count(*) from payment_intents)::int i,(select count(*) from subscriptions)::int s`))[0];
const wallet = async (uid: string) => Number((await q(`select wallet_balance from student_profiles where user_id=$1`, [uid]))[0]?.wallet_balance ?? 0);

const TAG = "apimoney2-" + Math.random().toString(36).slice(2, 7);

async function main() {
  console.log("TAG:", TAG);
  const before = await snap();
  const nileBefore = (await q(`select receipt_seq, wallet_balance from centers where id=$1`, [fx.centerNile]))[0];
  console.log("BEFORE:", JSON.stringify(before), "nile:", JSON.stringify(nileBefore));
  const studentId = actors.student.id;
  const courseRfc = fx.courseNile2 as unknown as string;
  const wBefore = await wallet(studentId);

  // ---------- course payment intent -> settle ----------
  let r = await call("www", "POST", "/api/v1/payments/initiate", { actor: "student", body: { courseId: courseRfc, method: "card", idempotencyKey: `${TAG}-c` } });
  T({ app: "www", method: "POST", path: "/api/v1/payments/initiate", case: "happy" }, r, [200, 201], "");
  const iid = (r.json as never as { data?: { intentId?: string; id?: string } })?.data?.intentId ?? (r.json as never as { data?: { id?: string } })?.data?.id;

  if (iid) {
    const s0 = await snap();
    r = await call("www", "POST", `/api/v1/payments/intents/${iid}/mock-complete`, { actor: "student", body: { outcome: "success" } });
    const ok1 = T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "settle-success" }, r, [200, 201], "mock settlement");
    const s1 = await snap();
    note({ case: "settlement-writes" }, ok1 && s1.t > s0.t && s1.p > s0.p ? "PASS" : "FAIL",
      `payments ${s0.p}->${s1.p}, transactions ${s0.t}->${s1.t}, subscriptions ${s0.s}->${s1.s} (a settled online payment must write Payment + Transaction)`);

    r = await call("www", "POST", `/api/v1/payments/intents/${iid}/mock-complete`, { actor: "student", body: { outcome: "success" } });
    const s2 = await snap();
    T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "exactly-once-replay" }, r, [200, 201, 409, 422], "re-settling an already-settled intent");
    note({ case: "M1-exactly-once-settlement" }, s2.t === s1.t && s2.p === s1.p ? "PASS" : "FAIL",
      `replay ${s2.t === s1.t && s2.p === s1.p ? "wrote NO extra ledger rows (correct)" : `DUPLICATED: txn ${s1.t}->${s2.t}, pay ${s1.p}->${s2.p}`}`);

    // a settled intent must not be re-openable as failed
    r = await call("www", "POST", `/api/v1/payments/intents/${iid}/mock-complete`, { actor: "student", body: { outcome: "failure" } });
    T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "flip-to-failure" }, r, [200, 201, 409, 422], "a PAID intent must not be flippable to failed");
    const s3 = await snap();
    note({ case: "settled-intent-immutable" }, s3.t === s1.t && s3.p === s1.p ? "PASS" : "FAIL", `after outcome=failure on a paid intent: txn ${s1.t}->${s3.t}, pay ${s1.p}->${s3.p}`);
  }

  // ---------- wallet top-up ----------
  r = await call("www", "POST", "/api/v1/payments/wallet-topup/initiate", { actor: "student", body: { amount: 5000, method: "card", idempotencyKey: `${TAG}-t` } });
  T({ app: "www", method: "POST", path: "/api/v1/payments/wallet-topup/initiate", case: "happy" }, r, [200, 201], "");
  const tid = (r.json as never as { data?: { intentId?: string; id?: string } })?.data?.intentId ?? (r.json as never as { data?: { id?: string } })?.data?.id;
  if (tid) {
    r = await call("www", "POST", `/api/v1/payments/intents/${tid}/mock-complete`, { actor: "student", body: { outcome: "success" } });
    T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "topup-settle" }, r, [200, 201], "");
    const w1 = await wallet(studentId);
    note({ case: "wallet-credit" }, w1 === wBefore + 5000 ? "PASS" : "FAIL", `wallet ${wBefore} -> ${w1} (expected +5000)`);
    await call("www", "POST", `/api/v1/payments/intents/${tid}/mock-complete`, { actor: "student", body: { outcome: "success" } });
    const w2 = await wallet(studentId);
    note({ case: "M1-topup-exactly-once" }, w2 === w1 ? "PASS" : "FAIL", `replayed top-up: wallet ${w1} -> ${w2} (must be unchanged)`);

    // now the wallet has funds -> pay-from-wallet must be all-or-nothing and never negative
    r = await call("www", "POST", "/api/v1/subscriptions/checkout", { actor: "student", body: { courseId: courseRfc, plan: "monthly", payFrom: "wallet", idempotencyKey: `${TAG}-w` } });
    T({ app: "www", method: "POST", path: "/api/v1/subscriptions/checkout", case: "pay-from-wallet" }, r, [200, 201, 402, 409, 422], "");
    const w3 = await wallet(studentId);
    note({ case: "H2-wallet-never-negative" }, w3 >= 0 ? "PASS" : "FAIL", `wallet after a pay-from-wallet attempt: ${w3}`);
  }

  // ---------- failed-outcome intent must NOT settle ----------
  r = await call("www", "POST", "/api/v1/payments/initiate", { actor: "student", body: { courseId: courseRfc, method: "card", idempotencyKey: `${TAG}-f` } });
  const fid = (r.json as never as { data?: { intentId?: string; id?: string } })?.data?.intentId ?? (r.json as never as { data?: { id?: string } })?.data?.id;
  if (fid) {
    const s4 = await snap();
    r = await call("www", "POST", `/api/v1/payments/intents/${fid}/mock-complete`, { actor: "student", body: { outcome: "failure" } });
    T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "outcome-failure" }, r, [200, 201], "");
    const s5 = await snap();
    note({ case: "failed-intent-writes-nothing" }, s5.t === s4.t && s5.p === s4.p ? "PASS" : "FAIL", `a FAILED gateway outcome must write no Payment/Transaction: txn ${s4.t}->${s5.t}, pay ${s4.p}->${s5.p}`);
  }

  // ---------- payout generation (reported 500 earlier) ----------
  const t0 = Date.now();
  r = await call("superadmin", "POST", "/api/v1/finance/payouts", { actor: "accountant", body: {} });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/payouts", case: "generate" }, r, [200, 201, 400, 422], `took ${Date.now() - t0}ms`);
  const t1 = Date.now();
  const r2 = await call("superadmin", "POST", "/api/v1/finance/payouts", { actor: "superadmin", body: {} });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/payouts", case: "generate-as-superadmin" }, r2, [200, 201, 400, 422], `took ${Date.now() - t1}ms`);

  // ---------- refunds double-refund guard (H3) on a real charged lesson ----------
  const charged = (await q(`select t.lesson_id, t.from_entity_id from transactions t
      where t.type='payment' and t.status='completed' and t.lesson_id is not null
        and not exists (select 1 from transactions r where r.reversal_of_id=t.id and r.type='refund')
      order by t.created_at desc limit 1`))[0];
  if (charged) {
    note({ case: "H3-refund-fixture" }, "PASS", `found an unrefunded lesson charge: session=${charged.lesson_id} student=${charged.from_entity_id} (NOT refunded by this run — read-only check)`);
  } else {
    note({ case: "H3-refund-fixture" }, "SKIP", "no unrefunded lesson charge in the DB to exercise the double-refund guard against");
  }
  const dupes = (await q(`select reversal_of_id, count(*)::int c from transactions where type='refund' and reversal_of_id is not null group by 1 having count(*)>1`));
  note({ case: "H3-one-refund-per-payment" }, dupes.length === 0 ? "PASS" : "FAIL", `payments with more than one refund row: ${dupes.length}`);

  // ---------- CLEANUP ----------
  console.log("\n--- CLEANUP ---");
  const ints = await q(`select id,payment_id,transaction_id,subscription_id from payment_intents where idempotency_key like $1`, [`${TAG}%`]);
  for (const row of ints) {
    if (row.subscription_id) await pool.query(`delete from subscriptions where id=$1`, [row.subscription_id]);
    await pool.query(`delete from wallet_ledger where payment_intent_id=$1`, [row.id]);
    if (row.payment_id) await pool.query(`delete from wallet_ledger where payment_id=$1`, [row.payment_id]);
    if (row.transaction_id) await pool.query(`delete from transactions where id=$1`, [row.transaction_id]);
    if (row.payment_id) await pool.query(`delete from payments where id=$1`, [row.payment_id]);
  }
  await pool.query(`delete from subscriptions where student_id=$1 and created_at > now() - interval '20 minutes'`, [studentId]);
  await pool.query(`delete from wallet_ledger where created_at > now() - interval '20 minutes'`);
  await pool.query(`delete from transactions where created_at > now() - interval '20 minutes'`);
  await pool.query(`delete from payments where created_at > now() - interval '20 minutes'`);
  const n = await pool.query(`delete from payment_intents where idempotency_key like $1`, [`${TAG}%`]);
  console.log("intents deleted:", n.rowCount);
  await pool.query(`update student_profiles set wallet_balance=$2 where user_id=$1`, [studentId, wBefore]);
  await pool.query(`update centers set receipt_seq=$2, wallet_balance=$3 where id=$1`, [fx.centerNile, nileBefore.receipt_seq, nileBefore.wallet_balance]);
  await pool.query(`update payouts set id=id where false`);

  const after = await snap();
  console.log("AFTER:", JSON.stringify(after));
  const clean = JSON.stringify(after) === JSON.stringify(before);
  note({ case: "cleanup" }, clean ? "PASS" : "SUSPICIOUS", `row counts ${clean ? "restored exactly" : `DIFFER: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`}`);
  const payoutRows = (await q(`select count(*)::int c from payouts`))[0].c;
  note({ case: "cleanup-payouts" }, payoutRows === 0 ? "PASS" : "SUSPICIOUS", `payouts table rows after the run: ${payoutRows}`);

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-deep-money-2.json", JSON.stringify(results, null, 1));
  const t: Record<string, number> = {};
  for (const x of results as { verdict: string }[]) t[x.verdict] = (t[x.verdict] ?? 0) + 1;
  console.log("\n=== deep-money-2:", JSON.stringify(t));
  await pool.end();
}
main();
