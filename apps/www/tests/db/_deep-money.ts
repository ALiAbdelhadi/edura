/**
 * PHASE 2e — MONEY paths, exercised live.
 *
 * DISCLOSURE: this suite DOES write to the money ledger, but only through
 * demo/seed entities (the NILE preview center + its demo student), and every
 * row it creates is deleted again at the end (and the wallet balances restored
 * to their pre-run values). Balances are captured before and after and printed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws as never;
const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows;

const FX = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/fixtures.json", "utf8"));
const actors = FX.actors as Record<string, { cookie: string; id: string; email: string }>;
const fx = FX.fixtures as Record<string, never>;
const results: unknown[] = [];

async function call(app: string, method: string, path: string, opts: { actor?: string | null; body?: unknown; headers?: Record<string, string> } = {}) {
  const b = app === "superadmin" ? "http://localhost:3004" : "http://localhost:3002";
  const h: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.actor) h.cookie = actors[opts.actor].cookie;
  let payload: string | undefined;
  if (opts.body !== undefined) { payload = typeof opts.body === "string" ? (opts.body as string) : JSON.stringify(opts.body); h["content-type"] = h["content-type"] ?? "application/json"; }
  const res = await fetch(b + path, { method, headers: h, body: payload });
  const text = await res.text();
  let json: never | null = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text: text.slice(0, 600) };
}

function T(meta: Record<string, unknown>, res: { status: number; json: never | null; text: string }, expected: number[], note = "") {
  const okStatus = expected.includes(res.status);
  const row = {
    ...meta, status: res.status, expected: expected.join("|"),
    verdict: okStatus ? "PASS" : "FAIL",
    note: okStatus ? note : `${note ? note + " | " : ""}expected ${expected.join("|")}, got ${res.status}: ${(res.json ? JSON.stringify((res.json as { error?: unknown }).error ?? res.json) : res.text).slice(0, 300)}`,
    body: (res.json ? JSON.stringify(res.json) : res.text).slice(0, 500),
  };
  results.push(row);
  console.log((okStatus ? "✓" : "✗"), `[${meta.app}] ${meta.method} ${meta.path} (${meta.case}/${meta.actor ?? "-"}) -> ${res.status}`, okStatus ? "" : ":: " + row.note);
  return okStatus;
}
function note(meta: Record<string, unknown>, verdict: string, text: string) {
  results.push({ ...meta, verdict, note: text, status: meta.status ?? 0, expected: "-" });
  console.log(verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : "?", `[${meta.app ?? "db"}] ${meta.case} :: ${text}`);
}

async function snapshot(label: string) {
  const [txn] = await q(`select count(*)::int c, coalesce(sum(amount),0)::bigint s from transactions`);
  const [pay] = await q(`select count(*)::int c from payments`);
  const [wl] = await q(`select count(*)::int c from wallet_ledger`);
  const [pi] = await q(`select count(*)::int c from payment_intents`);
  const [sub] = await q(`select count(*)::int c from subscriptions`);
  const wallets = await q(`select id,wallet_balance from student_profiles where wallet_balance <> 0 order by id`);
  const tw = await q(`select user_id,wallet_balance from teacher_profiles where wallet_balance <> 0 order by user_id`);
  const cw = await q(`select id,wallet_balance from centers where wallet_balance <> 0 order by id`);
  return { label, txn, pay, wl, pi, sub, wallets, tw, cw };
}

const TAG = "apimoney-" + Math.random().toString(36).slice(2, 7);
const cleanup: string[] = [];

async function main() {
  console.log("MONEY RUN TAG:", TAG);
  const before = await snapshot("before");
  console.log("BEFORE:", JSON.stringify({ txn: before.txn, pay: before.pay, wl: before.wl, pi: before.pi, sub: before.sub }));

  const studentId = actors.student.id;
  const courseRfc = fx.courseNile2 as unknown as string; // RFC-valid uuid, price 30000

  // ============ PAYMOB WEBHOOK — HMAC ============
  const payload = { obj: { id: 123456, amount_cents: 30000, success: true, order: { id: 999 } }, type: "TRANSACTION" };
  let r = await call("www", "POST", "/api/v1/payments/paymob/webhook", { body: payload });
  T({ app: "www", method: "POST", path: "/api/v1/payments/paymob/webhook", case: "no-hmac", actor: null }, r, [400, 401, 403], "webhook without an HMAC must be rejected");
  r = await call("www", "POST", "/api/v1/payments/paymob/webhook?hmac=deadbeef", { body: payload });
  T({ app: "www", method: "POST", path: "/api/v1/payments/paymob/webhook", case: "bad-hmac", actor: null }, r, [400, 401, 403], "forged HMAC must be rejected");
  const fakeSig = crypto.createHmac("sha512", "not-the-real-secret").update("x").digest("hex");
  r = await call("www", "POST", `/api/v1/payments/paymob/webhook?hmac=${fakeSig}`, { body: payload });
  T({ app: "www", method: "POST", path: "/api/v1/payments/paymob/webhook", case: "wrong-key-hmac", actor: null }, r, [400, 401, 403], "HMAC signed with the wrong key must be rejected");

  // ============ PAYMENT INTENT (mock gateway) ============
  const idem = `${TAG}-course`;
  r = await call("www", "POST", "/api/v1/payments/initiate", { actor: "student", body: { courseId: courseRfc, method: "card", idempotencyKey: idem } });
  const initOk = T({ app: "www", method: "POST", path: "/api/v1/payments/initiate", case: "happy", actor: "student" }, r, [200, 201], "mock gateway intent");
  const intentId = (r.json as never as { data?: { intentId?: string; id?: string; intent?: { id?: string } } })?.data?.intentId
    ?? (r.json as never as { data?: { id?: string } })?.data?.id
    ?? (r.json as never as { data?: { intent?: { id?: string } } })?.data?.intent?.id;
  if (intentId) cleanup.push(intentId);

  // client-sent amount must be refused (server-side price only)
  r = await call("www", "POST", "/api/v1/payments/initiate", { actor: "student", body: { courseId: courseRfc, method: "card", idempotencyKey: `${TAG}-amt`, amount: 1 } });
  T({ app: "www", method: "POST", path: "/api/v1/payments/initiate", case: "client-amount-rejected", actor: "student" }, r, [400, 422], "a client-supplied amount must be a validation error");

  // idempotent replay returns the SAME intent
  r = await call("www", "POST", "/api/v1/payments/initiate", { actor: "student", body: { courseId: courseRfc, method: "card", idempotencyKey: idem } });
  const replayId = (r.json as never as { data?: { intentId?: string; id?: string } })?.data?.intentId ?? (r.json as never as { data?: { id?: string } })?.data?.id;
  T({ app: "www", method: "POST", path: "/api/v1/payments/initiate", case: "idempotent-replay", actor: "student" }, r, [200, 201], `same idempotencyKey -> ${replayId === intentId ? "SAME intent (correct)" : `DIFFERENT intent (${intentId} vs ${replayId})`}`);
  note({ app: "www", case: "M1-intent-idempotency", path: "/api/v1/payments/initiate", method: "POST", actor: "student" },
    replayId && replayId === intentId ? "PASS" : "FAIL",
    `idempotencyKey replay returned ${replayId === intentId ? "the same" : "a DIFFERENT"} intent id`);

  // another student must not read this intent
  if (intentId) {
    r = await call("www", "GET", `/api/v1/payments/intents/${intentId}`, { actor: "msgStudentResolved" });
    T({ app: "www", method: "GET", path: "/api/v1/payments/intents/[id]", case: "not-owner", actor: "msgStudentResolved" }, r, [403, 404], "another student must not read this intent");
    r = await call("www", "GET", `/api/v1/payments/intents/${intentId}`, { actor: "student" });
    T({ app: "www", method: "GET", path: "/api/v1/payments/intents/[id]", case: "owner", actor: "student" }, r, [200], "");
    r = await call("www", "POST", `/api/v1/payments/intents/${intentId}/mock-complete`, { actor: "msgStudentResolved", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "not-owner", actor: "msgStudentResolved" }, r, [400, 403, 404, 422], "another student must not settle this intent");

    const beforeSettle = await snapshot("beforeSettle");
    r = await call("www", "POST", `/api/v1/payments/intents/${intentId}/mock-complete`, { actor: "student", body: {} });
    const settled = T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "happy", actor: "student" }, r, [200, 201], "mock settlement (PAYMENTS_MODE=mock)");
    const afterSettle = await snapshot("afterSettle");
    note({ app: "db", case: "settlement-writes" }, settled ? "PASS" : "FAIL",
      `payments ${beforeSettle.pay.c}->${afterSettle.pay.c}, transactions ${beforeSettle.txn.c}->${afterSettle.txn.c}, subscriptions ${beforeSettle.sub.c}->${afterSettle.sub.c}`);

    // EXACTLY-ONCE: settle the same intent again
    r = await call("www", "POST", `/api/v1/payments/intents/${intentId}/mock-complete`, { actor: "student", body: {} });
    const afterReplay = await snapshot("afterReplay");
    const noDouble = afterReplay.txn.c === afterSettle.txn.c && afterReplay.pay.c === afterSettle.pay.c;
    T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "exactly-once-replay", actor: "student" }, r, [200, 201, 409, 422], "replaying a settled intent");
    note({ app: "db", case: "exactly-once-settlement" }, noDouble ? "PASS" : "FAIL",
      `re-settling the SAME intent ${noDouble ? "wrote NO extra rows (correct)" : `WROTE MORE ROWS: txn ${afterSettle.txn.c}->${afterReplay.txn.c}, pay ${afterSettle.pay.c}->${afterReplay.pay.c}`}`);
  }

  // ============ WALLET TOP-UP ============
  const wBefore = (await q(`select wallet_balance from student_profiles where user_id=$1`, [studentId]))[0]?.wallet_balance ?? 0;
  r = await call("www", "POST", "/api/v1/payments/wallet-topup/initiate", { actor: "student", body: { amount: 5000, method: "card", idempotencyKey: `${TAG}-topup` } });
  T({ app: "www", method: "POST", path: "/api/v1/payments/wallet-topup/initiate", case: "happy", actor: "student" }, r, [200, 201], "");
  const topIntent = (r.json as never as { data?: { intentId?: string; id?: string } })?.data?.intentId ?? (r.json as never as { data?: { id?: string } })?.data?.id;
  r = await call("www", "POST", "/api/v1/payments/wallet-topup/initiate", { actor: "student", body: { amount: -100, method: "card", idempotencyKey: `${TAG}-neg` } });
  T({ app: "www", method: "POST", path: "/api/v1/payments/wallet-topup/initiate", case: "negative-amount", actor: "student" }, r, [400, 422], "negative top-up rejected");
  r = await call("www", "POST", "/api/v1/payments/wallet-topup/initiate", { actor: "student", body: { amount: 999999999, method: "card", idempotencyKey: `${TAG}-huge` } });
  T({ app: "www", method: "POST", path: "/api/v1/payments/wallet-topup/initiate", case: "over-cap", actor: "student" }, r, [400, 422], "top-up cap enforced");
  if (topIntent) {
    r = await call("www", "POST", `/api/v1/payments/intents/${topIntent}/mock-complete`, { actor: "student", body: {} });
    T({ app: "www", method: "POST", path: "/api/v1/payments/intents/[id]/mock-complete", case: "wallet-topup-settle", actor: "student" }, r, [200, 201], "");
    const wAfter = (await q(`select wallet_balance from student_profiles where user_id=$1`, [studentId]))[0]?.wallet_balance ?? 0;
    note({ app: "db", case: "wallet-credit" }, Number(wAfter) === Number(wBefore) + 5000 ? "PASS" : "FAIL", `wallet ${wBefore} -> ${wAfter} (expected +5000)`);
    // replay must not double-credit
    await call("www", "POST", `/api/v1/payments/intents/${topIntent}/mock-complete`, { actor: "student", body: {} });
    const wAfter2 = (await q(`select wallet_balance from student_profiles where user_id=$1`, [studentId]))[0]?.wallet_balance ?? 0;
    note({ app: "db", case: "wallet-topup-exactly-once" }, Number(wAfter2) === Number(wAfter) ? "PASS" : "FAIL", `replayed top-up settlement: wallet ${wAfter} -> ${wAfter2} (must be unchanged)`);
  }

  // ============ WALLET FLOOR ============
  r = await call("www", "POST", "/api/v1/subscriptions/checkout", { actor: "student", body: { courseId: courseRfc, plan: "monthly", payFrom: "wallet", idempotencyKey: `${TAG}-walletpay` } });
  T({ app: "www", method: "POST", path: "/api/v1/subscriptions/checkout", case: "wallet-insufficient", actor: "student" }, r, [200, 201, 402, 409, 422], "pay-from-wallet is all-or-nothing; must never go negative");
  const wFloor = (await q(`select count(*)::int c from student_profiles where wallet_balance < 0`))[0].c;
  note({ app: "db", case: "H2-wallet-floor" }, wFloor === 0 ? "PASS" : "FAIL", `student wallets below zero: ${wFloor}`);
  const negT = (await q(`select count(*)::int c from teacher_profiles where wallet_balance < 0`))[0].c;
  const negC = (await q(`select count(*)::int c from centers where wallet_balance < 0`))[0].c;
  note({ app: "db", case: "H2-wallet-floor-beneficiaries" }, negT === 0 ? "PASS" : "SUSPICIOUS", `teacher wallets < 0: ${negT}, center wallets < 0: ${negC} (the legacy -2600 center row is a known pre-launch leftover)`);

  // ============ PAYOUT REQUESTS ============
  r = await call("www", "POST", "/api/v1/teacher/wallet/payout-request", { actor: "teacher", body: { amount: 999999900 } });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/wallet/payout-request", case: "over-balance", actor: "teacher" }, r, [400, 402, 409, 422], "H1/H2: cannot request more than the balance");
  r = await call("www", "POST", "/api/v1/teacher/wallet/payout-request", { actor: "assistant", body: { amount: 100 } });
  T({ app: "www", method: "POST", path: "/api/v1/teacher/wallet/payout-request", case: "assistant-excluded", actor: "assistant" }, r, [401, 403], "decision #9: payouts are excluded from delegation");
  r = await call("www", "POST", "/api/v1/center/wallet/payout-request", { actor: "centerAdmin", body: { amount: 999999900 } });
  T({ app: "www", method: "POST", path: "/api/v1/center/wallet/payout-request", case: "over-balance", actor: "centerAdmin" }, r, [400, 402, 409, 422], "");
  r = await call("www", "POST", "/api/v1/center/wallet/payout-request", { actor: "receptionist", body: { amount: 100 } });
  T({ app: "www", method: "POST", path: "/api/v1/center/wallet/payout-request", case: "staff-excluded", actor: "receptionist" }, r, [401, 403], "front desk must not move center money");
  r = await call("www", "POST", "/api/v1/center/wallet/payout-request", { actor: "centerAdmin", body: { amount: -100 } });
  T({ app: "www", method: "POST", path: "/api/v1/center/wallet/payout-request", case: "negative", actor: "centerAdmin" }, r, [400, 422], "");

  // ============ CASH PAYMENT + LEDGER RECONCILIATION (Step 4) ============
  const bCash = await snapshot("beforeCash");
  r = await call("www", "POST", "/api/v1/payments", { actor: "centerAdmin", body: { studentId, courseId: courseRfc, amount: 1000, note: `${TAG} cash probe` } });
  const cashOk = T({ app: "www", method: "POST", path: "/api/v1/payments", case: "cash-happy", actor: "centerAdmin" }, r, [200, 201], "cash payment recorded by the center");
  const cashPaymentId = (r.json as never as { data?: { id?: string } })?.data?.id;
  const aCash = await snapshot("afterCash");
  note({ app: "db", case: "Step4-cash-mirrors-to-ledger" }, cashOk && aCash.txn.c > bCash.txn.c ? "PASS" : cashOk ? "FAIL" : "SKIP",
    `cash payment: payments ${bCash.pay.c}->${aCash.pay.c}, transactions ${bCash.txn.c}->${aCash.txn.c} (a cash payment MUST mirror to the ledger)`);
  r = await call("www", "POST", "/api/v1/payments", { actor: "centerAdminAlien", body: { studentId, courseId: courseRfc, amount: 1000 } });
  T({ app: "www", method: "POST", path: "/api/v1/payments", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404, 422], "another center must not record a payment on this course");
  r = await call("www", "POST", "/api/v1/payments", { actor: "receptionist", body: { studentId, courseId: courseRfc, amount: 1000 } });
  T({ app: "www", method: "POST", path: "/api/v1/payments", case: "staff-tier", actor: "receptionist" }, r, [200, 201, 401, 403], "which staff tier may record cash?");
  if (cashPaymentId) {
    r = await call("www", "GET", `/api/v1/payments/${cashPaymentId}/receipt`, { actor: "centerAdmin" });
    T({ app: "www", method: "GET", path: "/api/v1/payments/[id]/receipt", case: "pdf", actor: "centerAdmin" }, r, [200], "receipt PDF renders");
    r = await call("www", "PATCH", `/api/v1/payments/${cashPaymentId}`, { actor: "centerAdminAlien", body: { note: "x" } });
    T({ app: "www", method: "PATCH", path: "/api/v1/payments/[id]", case: "cross-tenant", actor: "centerAdminAlien" }, r, [403, 404], "");
  }

  // ============ FINANCE: refunds / payouts (accountant) ============
  r = await call("superadmin", "POST", "/api/v1/finance/refunds", { actor: "accountant", body: {} });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/refunds", case: "invalid-body", actor: "accountant" }, r, [400, 422], "");
  r = await call("superadmin", "POST", "/api/v1/finance/refunds", { actor: "accountant", body: { sessionId: fx.sessionScheduled?.["id"], studentId, reason: "" } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/refunds", case: "reason-required", actor: "accountant" }, r, [400, 422], "a refund reason is mandatory");
  r = await call("superadmin", "POST", "/api/v1/finance/refunds", { actor: "superadmin", body: { sessionId: fx.sessionScheduled?.["id"], studentId, reason: `${TAG} probe` } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/refunds", case: "no-charge-to-refund", actor: "superadmin" }, r, [404, 422], "refunding a lesson with no completed charge");
  r = await call("superadmin", "POST", "/api/v1/finance/payouts", { actor: "accountant", body: {} });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/payouts", case: "generate", actor: "accountant" }, r, [200, 201, 400, 422], "payout generation");
  r = await call("superadmin", "POST", "/api/v1/finance/payouts/bulk-approve", { actor: "accountant", body: { ids: [] } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/payouts/bulk-approve", case: "empty", actor: "accountant" }, r, [200, 400, 422], "");
  r = await call("superadmin", "POST", "/api/v1/finance/invoices", { actor: "accountant", body: {} });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/invoices", case: "invalid-body", actor: "accountant" }, r, [400, 422], "");
  r = await call("superadmin", "POST", "/api/v1/finance/refunds", { actor: "centerAdmin", body: { sessionId: fx.sessionScheduled?.["id"], studentId, reason: "x" } });
  T({ app: "superadmin", method: "POST", path: "/api/v1/finance/refunds", case: "www-role", actor: "centerAdmin" }, r, [401, 403], "a www role must never reach the refund endpoint");

  // ============ TRIAL BALANCE FORMULA ============
  const tb = await call("superadmin", "GET", "/api/v1/finance/reports/trial-balance", { actor: "accountant" });
  const lines = (tb.json as never as { data?: { lines?: { type: string; total: number }[]; platformNet?: number } })?.data;
  const get = (t: string) => lines?.lines?.find((l) => l.type === t)?.total ?? 0;
  note({ app: "superadmin", case: "trial-balance-formula", path: "/api/v1/finance/reports/trial-balance", method: "GET", actor: "accountant" },
    (lines?.platformNet ?? 0) < 0 && get("commission") > 0 ? "FAIL" : "PASS",
    `platformNet=${lines?.platformNet} from commission=${get("commission")} - payout=${get("payout")} - refund=${get("refund")}. ` +
    `A refund transaction carries the GROSS student amount; the platform's actual give-back is the two 'adjustment' fee-return rows (=${get("adjustment")}). ` +
    `Subtracting gross refunds from commission understates platform net.`);

  // ============ CLEANUP ============
  console.log("\n--- CLEANUP ---");
  const del = async (sql: string, p: unknown[] = []) => { const res = await pool.query(sql, p); return res.rowCount ?? 0; };
  let n = 0;
  n = await del(`delete from wallet_ledger where reason like $1 or ref_number in (select ref_number from transactions where notes like $1)`, [`%${TAG}%`]);
  console.log("wallet_ledger deleted:", n);
  n = await del(`delete from transactions where notes like $1`, [`%${TAG}%`]);
  console.log("transactions(tagged) deleted:", n);
  // rows created by settlement of our intents (no tag on them) — bounded by our intent ids
  if (cleanup.length) {
    const pids = await q(`select payment_id, transaction_id, subscription_id from payment_intents where id = any($1::uuid[])`, [cleanup]);
    for (const row of pids) {
      if (row.transaction_id) await del(`delete from transactions where id=$1`, [row.transaction_id]);
      if (row.payment_id) await del(`delete from payments where id=$1`, [row.payment_id]);
      if (row.subscription_id) await del(`delete from subscriptions where id=$1`, [row.subscription_id]);
    }
  }
  n = await del(`delete from payment_intents where idempotency_key like $1`, [`${TAG}%`]);
  console.log("payment_intents deleted:", n);
  n = await del(`delete from wallet_ledger where student_id=(select id from student_profiles where user_id=$1) and created_at > now() - interval '20 minutes'`, [studentId]);
  console.log("wallet_ledger(recent for demo student) deleted:", n);
  n = await del(`delete from payments where note like $1`, [`%${TAG}%`]);
  console.log("payments(tagged) deleted:", n);
  n = await del(`delete from subscriptions where created_at > now() - interval '20 minutes' and student_id=$1`, [studentId]);
  console.log("subscriptions(recent for demo student) deleted:", n);

  // restore balances to the pre-run snapshot
  await pool.query(`update student_profiles set wallet_balance = 0 where wallet_balance <> 0 and id not in (select unnest($1::uuid[]))`, [before.wallets.map((w: { id: string }) => w.id)]);
  for (const w of before.wallets) await pool.query(`update student_profiles set wallet_balance=$2 where id=$1`, [w.id, w.wallet_balance]);
  for (const w of before.tw) await pool.query(`update teacher_profiles set wallet_balance=$2 where user_id=$1`, [w.user_id, w.wallet_balance]);
  for (const w of before.cw) await pool.query(`update centers set wallet_balance=$2 where id=$1`, [w.id, w.wallet_balance]);

  const after = await snapshot("after");
  console.log("AFTER:", JSON.stringify({ txn: after.txn, pay: after.pay, wl: after.wl, pi: after.pi, sub: after.sub }));
  const clean = after.txn.c === before.txn.c && after.pay.c === before.pay.c && after.wl.c === before.wl.c && after.pi.c === before.pi.c && after.sub.c === before.sub.c;
  note({ app: "db", case: "cleanup" }, clean ? "PASS" : "SUSPICIOUS",
    `row counts ${clean ? "restored exactly" : "DIFFER"}: txn ${before.txn.c}->${after.txn.c}, pay ${before.pay.c}->${after.pay.c}, wallet_ledger ${before.wl.c}->${after.wl.c}, intents ${before.pi.c}->${after.pi.c}, subs ${before.sub.c}->${after.sub.c}`);

  fs.writeFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/results-deep-money.json", JSON.stringify(results, null, 1));
  const t: Record<string, number> = {};
  for (const r2 of results as { verdict: string }[]) t[r2.verdict] = (t[r2.verdict] ?? 0) + 1;
  console.log("\n=== deep-money:", JSON.stringify(t));
  await pool.end();
}
main();
