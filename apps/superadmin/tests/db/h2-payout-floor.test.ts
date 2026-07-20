// H2 proof — payout settlement can never push a wallet negative.
//  (1) a settlement exceeding the balance is REJECTED (conditional decrement),
//  (2) the DB CHECK (wallet_balance >= 0) rejects a direct negative write,
//  (3) a normal valid settlement still works.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { approvePayout } from "@/lib/services/finance/payouts";
import type { SessionUser } from "@/lib/auth/session";

neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

const HOSSAM = "47b21cb0-a166-5876-901f-2cc4ef9f8487";

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
  const adminUser = (
    await admin.query(`SELECT id FROM users WHERE role='super_admin' LIMIT 1`)
  ).rows[0].id as string;
  const superUser = { id: adminUser, role: "super_admin", locale: "en" } as SessionUser;

  const orig = await bal();
  await admin.query(`UPDATE teacher_profiles SET wallet_balance=5000 WHERE user_id=$1`, [HOSSAM]);

  // (1) OVER-BALANCE settlement is rejected; balance untouched, payout not paid.
  console.log("\n(1) settlement exceeding balance:");
  const bigId = await createPending(8000); // > 5000
  let threw = "";
  try { await approvePayout(bigId, superUser); } catch (e) { threw = (e as Error).message; }
  ok(threw.includes("Insufficient wallet balance"), `rejected: "${threw}"`);
  ok((await bal()) === 5000, `balance unchanged at 5000 (never negative)`);
  ok((await payoutStatus(bigId)) === "pending", `payout stayed 'pending' (settlement rolled back)`);

  // (2) DB-level CHECK rejects a direct negative write.
  console.log("\n(2) DB CHECK on a direct negative write:");
  let dbThrewTeacher = false;
  try {
    await admin.query(`UPDATE teacher_profiles SET wallet_balance=-100 WHERE user_id=$1`, [HOSSAM]);
  } catch (e) { dbThrewTeacher = String((e as Error).message).includes("wallet_balance_nonneg"); }
  ok(dbThrewTeacher, "teacher_profiles CHECK rejected wallet_balance = -100");

  const cleanCenter = (
    await admin.query(`SELECT id FROM centers WHERE wallet_balance >= 0 LIMIT 1`)
  ).rows[0].id as string;
  let dbThrewCenter = false;
  try {
    await admin.query(`UPDATE centers SET wallet_balance=-100 WHERE id=$1`, [cleanCenter]);
  } catch (e) { dbThrewCenter = String((e as Error).message).includes("wallet_balance_nonneg"); }
  ok(dbThrewCenter, "centers CHECK (NOT VALID) rejected a new negative write");

  // (3) NORMAL valid settlement still works.
  console.log("\n(3) normal valid settlement:");
  const okId = await createPending(3000); // <= 5000
  const paid = await approvePayout(okId, superUser);
  ok(paid.status === "paid", "payout settled -> 'paid'");
  ok((await bal()) === 2000, "balance decremented 5000 -> 2000");

  // Cleanup.
  await admin.query(`DELETE FROM payouts WHERE id = ANY($1::uuid[])`, [[bigId, okId]]);
  await admin.query(`DELETE FROM notifications WHERE user_id=$1 AND created_at >= now() - interval '5 minutes'`, [HOSSAM]);
  await admin.query(`UPDATE teacher_profiles SET wallet_balance=$2 WHERE user_id=$1`, [HOSSAM, orig]);
  await admin.end();

  console.log(`\n${fail === 0 ? "H2 PROOF PASS ✔" : "H2 PROOF FAIL ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
