import { testPool } from "../../../../packages/database/scripts/test-pool";
import { approvePayout, payPayout } from "@/lib/services/finance/payouts";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import {
  createTeacherFixture,
  createCenterFixture,
} from "../../../../packages/database/scripts/payout-fixtures";
const admin = testPool();

const SUITE_NAME = "h2-payout-floor.test.ts";
let __sweepTag = "";
let HOSSAM = "";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

async function bal(): Promise<number> {
  return (await admin.query(`SELECT wallet_balance FROM teacher_profiles WHERE user_id=$1`, [HOSSAM]))
    .rows[0].wallet_balance;
}
async function createPending(net: number): Promise<string> {
  const r = await admin.query(
    `INSERT INTO payouts (beneficiary_id, beneficiary_type, net_payable, gross_amount, commission, lesson_count, status)
     VALUES ($1,'teacher',$2,$2,0,0,'pending') RETURNING id`,
    [HOSSAM, net],
  );
  return r.rows[0].id as string;
}
async function payoutStatus(id: string): Promise<string> {
  return (await admin.query(`SELECT status FROM payouts WHERE id=$1`, [id])).rows[0].status;
}

async function main() {
  const tag = "h2pf-" + Math.floor(Math.random() * 1e9).toString(36);
  __sweepTag = tag;
  HOSSAM = (await createTeacherFixture(tag, 5000)).userId;
  console.log(`  beneficiary under test: ${HOSSAM} (owned by this suite, tag ${tag})`);
  const adminUser = (
    await admin.query(`SELECT id FROM users WHERE role='super_admin' LIMIT 1`)
  ).rows[0].id as string;
  const superUser = { id: adminUser, role: "super_admin", locale: "en" } as SessionUser;
  // M-03: the money moves on the PAY step, by a different person than the approver.
  const payerId = (
    await admin.query(
      `INSERT INTO users (email, role, name, status, is_demo, updated_at)
       VALUES ($1, 'accountant', $2, 'active', true, now()) RETURNING id`,
      [`${tag}-payer@x.io`, `${tag} payer`],
    )
  ).rows[0].id as string;
  const payer = { id: payerId, role: "accountant", locale: "en" } as SessionUser;

  console.log("\n(1) settlement exceeding balance:");
  const bigId = await createPending(8000); // > 5000
  await approvePayout(bigId, superUser);
  ok((await bal()) === 5000, "approval moved NO money (M-03: a decision, not a disbursement)");
  let threw = "";
  try { await payPayout(bigId, { externalRef: `${tag}-REF-BIG` }, payer); } catch (e) { threw = (e as Error).message; }
  ok(threw.includes("Insufficient wallet balance"), `rejected: "${threw}"`);
  ok((await bal()) === 5000, `balance unchanged at 5000 (never negative)`);
  ok((await payoutStatus(bigId)) === "approved", `payout stayed 'approved' (settlement rolled back)`);

  console.log("\n(2) DB CHECK on a direct negative write:");
  let dbThrewTeacher = false;
  try {
    await admin.query(`UPDATE teacher_profiles SET wallet_balance=-100 WHERE user_id=$1`, [HOSSAM]);
  } catch (e) { dbThrewTeacher = String((e as Error).message).includes("wallet_balance_nonneg"); }
  ok(dbThrewTeacher, "teacher_profiles CHECK rejected wallet_balance = -100");

  const cleanCenter = (await createCenterFixture(tag, 0)).centerId;
  let dbThrewCenter = false;
  try {
    await admin.query(`UPDATE centers SET wallet_balance=-100 WHERE id=$1`, [cleanCenter]);
  } catch (e) { dbThrewCenter = String((e as Error).message).includes("wallet_balance_nonneg"); }
  ok(dbThrewCenter, "centers CHECK (NOT VALID) rejected a new negative write");

  console.log("\n(3) normal valid settlement: approve, then a second person pays");
  const okId = await createPending(3000); // <= 5000
  const approved = await approvePayout(okId, superUser);
  ok(approved.status === "approved" && (await bal()) === 5000, "approved, still 5000 in the wallet");
  const paid = await payPayout(okId, { externalRef: `${tag}-REF-OK` }, payer);
  ok(paid.status === "paid" && paid.externalRef === `${tag}-REF-OK`, "payout settled -> 'paid' with the transfer reference");
  ok((await bal()) === 2000, "balance decremented 5000 -> 2000 on the PAY step");
  await admin.query(`DELETE FROM users WHERE id = $1`, [payerId]).catch(() => undefined);

  await admin.end();

  console.log(`\n${fail === 0 ? "H2 PROOF PASS ✔" : "H2 PROOF FAIL ✗"} — ${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => { console.error(e); process.exit(1); });
