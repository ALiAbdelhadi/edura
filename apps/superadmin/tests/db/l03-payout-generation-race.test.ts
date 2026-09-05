// SECURITY_AUDIT.md L-03 — two concurrent payout generations must not create
// two pending payouts for one beneficiary. generateForChunk takes FOR UPDATE on
// the beneficiary rows BEFORE reading the open payouts, so the second run sees
// the first's row and skips; this pins that ordering.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { generatePayouts } from "@/lib/services/finance/payouts";
import type { SessionUser } from "@/lib/auth/session";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { createTeacherFixture } from "../../../../packages/database/scripts/payout-fixtures";

const admin = testPool();
let __sweepTag = "";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

async function main() {
  const tag = "l03-" + Math.floor(Math.random() * 1e9).toString(36);
  __sweepTag = tag;
  const teacher = (await createTeacherFixture(tag, 7000)).userId;
  const maker = (await admin.query(
    `INSERT INTO users (email, role, name, status, is_demo, updated_at) VALUES ($1,'accountant',$2,'active',true,now()) RETURNING id`,
    [`${tag}-maker@x.io`, `${tag} maker`],
  )).rows[0].id as string;
  const user = { id: maker, role: "accountant", locale: "en" } as SessionUser;

  console.log("\n[1] two generations at once");
  const [a, b] = await Promise.allSettled([generatePayouts(user), generatePayouts(user)]);
  ok(a.status === "fulfilled" && b.status === "fulfilled", "both runs complete without error");
  const rows = (await admin.query(`SELECT id, net_payable, status FROM payouts WHERE beneficiary_id=$1`, [teacher])).rows;
  ok(rows.length === 1, `exactly ONE payout exists for the beneficiary (got ${rows.length})`);
  ok(rows[0]?.net_payable === 7000 && rows[0]?.status === "pending", "…for the full available balance, pending");

  console.log("\n[2] a third run after the fact adds nothing");
  await generatePayouts(user);
  const again = (await admin.query(`SELECT count(*)::int n FROM payouts WHERE beneficiary_id=$1`, [teacher])).rows[0].n;
  ok(again === 1, "the open payout reserves the balance; no duplicate");

  await admin.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: "suite l03-payout-generation-race.test.ts" });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
