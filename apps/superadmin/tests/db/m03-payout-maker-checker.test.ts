// SECURITY_AUDIT.md M-03 — payout maker-checker.
//   [1] the generator cannot approve their own payout;
//   [2] approval moves no money; the approver cannot pay; a payer needs a ref;
//   [3] a third person pays: wallet decremented, ledger row, paid_by, external_ref;
//   [4] the same transfer reference cannot pay a second payout;
//   [5] an approved payout can still be rejected (the checker's refusal);
//   [6] the dashboard counts approved-not-paid as open.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { approvePayout, payPayout, rejectPayout, generatePayouts } from "@/lib/services/finance/payouts";
import type { SessionUser } from "@/lib/auth/session";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { createTeacherFixture } from "../../../../packages/database/scripts/payout-fixtures";

const admin = testPool();
const SUITE_NAME = "m03-payout-maker-checker.test.ts";
let __sweepTag = "";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };
async function caught(fn: () => Promise<unknown>) { try { await fn(); return null; } catch (e) { return e as Error; } }
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;

async function mkStaff(tag: string, role: "accountant" | "super_admin", k: string): Promise<SessionUser> {
  const id = (await q(
    `INSERT INTO users (email, role, name, status, is_demo, updated_at) VALUES ($1, $2::role, $3, 'active', true, now()) RETURNING id`,
    [`${tag}-${k}@x.io`, role, `${tag} ${k}`],
  ))[0].id as string;
  return { id, role, locale: "en" } as SessionUser;
}

async function main() {
  const tag = "m03-" + Math.floor(Math.random() * 1e9).toString(36);
  __sweepTag = tag;
  const teacher = (await createTeacherFixture(tag, 9000)).userId;
  const maker = await mkStaff(tag, "accountant", "maker");
  const checker = await mkStaff(tag, "accountant", "checker");
  const payer = await mkStaff(tag, "super_admin", "payer");
  const bal = async () => (await q(`SELECT wallet_balance FROM teacher_profiles WHERE user_id=$1`, [teacher]))[0].wallet_balance as number;

  console.log("\n[1] the maker generates; the maker cannot approve");
  await generatePayouts(maker);
  const payout = (await q(`SELECT id, status, generated_by FROM payouts WHERE beneficiary_id=$1 AND status='pending'`, [teacher]))[0];
  ok(!!payout && payout.generated_by === maker.id, "the generated payout records who generated it");
  const selfApprove = await caught(() => approvePayout(payout.id, maker));
  ok(selfApprove !== null && /different person must approve/.test(selfApprove.message), "the generator is refused as approver");

  console.log("\n[2] approval is a decision; the approver cannot pay; a ref is required");
  const approved = await approvePayout(payout.id, checker);
  ok(approved.status === "approved" && approved.approvedBy === checker.id, "approved, attributed to the checker");
  ok((await bal()) === 9000, "no money moved on approval");
  const ledgerBefore = (await q(`SELECT count(*)::int n FROM transactions WHERE type='payout' AND to_entity_id=$1`, [teacher]))[0].n;
  const approverPays = await caught(() => payPayout(payout.id, { externalRef: `${tag}-X` }, checker));
  ok(approverPays !== null && /cannot also mark it paid/.test(approverPays.message), "the approver is refused as payer");
  const makerPays = await caught(() => payPayout(payout.id, { externalRef: `${tag}-X` }, maker));
  ok(makerPays !== null && /cannot also mark it paid/.test(makerPays.message), "the generator is refused as payer too");
  const noRef = await caught(() => payPayout(payout.id, { externalRef: "   " }, payer));
  ok(noRef !== null && /reference is required/.test(noRef.message), "a blank transfer reference is refused");
  ok((await bal()) === 9000, "still no money moved");

  console.log("\n[3] a third person pays with a reference");
  const paid = await payPayout(payout.id, { externalRef: `${tag}-TRF-001` }, payer);
  ok(paid.status === "paid" && paid.paidBy === payer.id && paid.externalRef === `${tag}-TRF-001` && !!paid.paidAt, "paid, attributed, referenced, timestamped");
  ok((await bal()) === 0, "the wallet is decremented on the PAY step");
  const ledgerAfter = (await q(`SELECT count(*)::int n FROM transactions WHERE type='payout' AND to_entity_id=$1`, [teacher]))[0].n;
  ok(ledgerAfter === ledgerBefore + 1, "exactly one payout ledger row was written");
  const again = await caught(() => payPayout(payout.id, { externalRef: `${tag}-TRF-002` }, payer));
  ok(again !== null && /must be approved/.test(again.message), "paying a paid payout is refused");

  console.log("\n[4] the same transfer reference cannot pay a second payout");
  await q(`UPDATE teacher_profiles SET wallet_balance = 4000 WHERE user_id=$1`, [teacher]);
  const second = (await q(
    `INSERT INTO payouts (beneficiary_id, beneficiary_type, net_payable, gross_amount, commission, lesson_count, status, generated_by)
     VALUES ($1,'teacher',4000,4000,0,0,'pending',$2) RETURNING id`, [teacher, maker.id]))[0].id as string;
  await approvePayout(second, checker);
  const dupRef = await caught(() => payPayout(second, { externalRef: `${tag}-TRF-001` }, payer));
  ok(dupRef !== null && /already used for another payout/.test(dupRef.message), `a reused reference is refused (${dupRef?.message.slice(0, 60)})`);
  ok((await q(`SELECT status FROM payouts WHERE id=$1`, [second]))[0].status === "approved" && (await bal()) === 4000, "…and nothing moved");

  console.log("\n[5] the checker can still refuse an approved payout");
  const rejected = await rejectPayout(second, "wrong account details", payer);
  ok(rejected.status === "rejected" && rejected.rejectionReason === "wrong account details", "rejecting from `approved` works");

  console.log("\n[6] the dashboard counts approved-not-paid as open work");
  const third = (await q(
    `INSERT INTO payouts (beneficiary_id, beneficiary_type, net_payable, gross_amount, commission, lesson_count, status, generated_by)
     VALUES ($1,'teacher',1000,1000,0,0,'pending',$2) RETURNING id`, [teacher, maker.id]))[0].id as string;
  await approvePayout(third, checker);
  const { decisionQueue } = await import("@/lib/services/admin/platform-dashboard");
  const dash = await decisionQueue();
  ok(dash.payouts.count >= 1, `an approved payout is still counted as awaiting disbursement (count=${dash.payouts.count})`);

  await admin.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
