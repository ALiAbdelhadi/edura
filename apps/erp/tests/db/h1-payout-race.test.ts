import { testPool } from "../../../../packages/database/scripts/test-pool";
import { requestTeacherPayout } from "@repo/server-core/services/finance/teacher-wallet";
import { requestCenterPayout } from "@repo/server-core/services/finance/center-wallet";
import type { SessionUser } from "@repo/server-core/erp-auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import {
  createTeacherFixture,
  createCenterFixture,
} from "../../../../packages/database/scripts/payout-fixtures";
const admin = testPool();

const SUITE_NAME = "h1-payout-race.test.ts";
let __sweepTag = "";
let HOSSAM = "";
let CENTER = "";
let CENTER_ADMIN = "";
const BAL = 10_000; // 100 EGP

async function createFixtures(tag: string) {
  HOSSAM = (await createTeacherFixture(tag, BAL)).userId;
  const center = await createCenterFixture(tag, BAL);
  CENTER = center.centerId;
  CENTER_ADMIN = center.adminId;
  console.log(`  fixtures owned by this suite (tag ${tag}): teacher=${HOSSAM}, center=${CENTER}`);
}

async function openPayouts(beneficiaryId: string) {
  const r = await admin.query(
    `SELECT COALESCE(SUM(net_payable),0)::int AS total, COUNT(*)::int AS n
       FROM payouts WHERE beneficiary_id=$1 AND status IN ('pending','approved')`,
    [beneficiaryId],
  );
  return { total: r.rows[0].total as number, n: r.rows[0].n as number };
}

async function race(
  label: string,
  beneficiaryId: string,
  balanceTable: "teacher_profiles" | "centers",
  balanceKey: "user_id" | "id",
  request: () => Promise<unknown>,
): Promise<boolean> {
  await admin.query(
    `UPDATE ${balanceTable} SET wallet_balance=$2 WHERE ${balanceKey}=$1`,
    [beneficiaryId, BAL],
  );

  const results = await Promise.allSettled([request(), request()]);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected");
  const after = await openPayouts(beneficiaryId);

  console.log(`\n[${label}] concurrent full-balance requests → fulfilled: ${fulfilled}, rejected: ${rejected.length}`);
  if (rejected[0] && rejected[0].status === "rejected") {
    console.log(`  loser rejected with: "${(rejected[0].reason as Error)?.message}"`);
  }
  console.log(`  open payouts after: count=${after.n}, total reserved=${after.total} (wallet=${BAL})`);

  const pass = fulfilled === 1 && rejected.length === 1 && after.n === 1 && after.total === BAL;
  console.log(pass ? `  ${label} PASS ✔ — exactly one won; not over-drawn` : `  ${label} FAIL ✗`);
  return pass;
}

async function main() {
  const tag = "h1pr-" + Math.floor(Math.random() * 1e9).toString(36);
  __sweepTag = tag;
  await createFixtures(tag);
  const teacher = { id: HOSSAM, role: "teacher", locale: "en" } as SessionUser;
  const centerAdmin = {
    id: CENTER_ADMIN,
    role: "center_admin",
    centerId: CENTER,
    locale: "en",
  } as SessionUser;

  const teacherPass = await race("TEACHER", HOSSAM, "teacher_profiles", "user_id", () =>
    requestTeacherPayout(teacher),
  );
  const centerPass = await race("CENTER", CENTER, "centers", "id", () =>
    requestCenterPayout(centerAdmin),
  );

  await admin.end();
  console.log(`\n${teacherPass && centerPass ? "H1 PROOF PASS ✔ (teacher + center)" : "H1 PROOF FAIL ✗"}`);
  process.exitCode = teacherPass && centerPass ? 0 : 1;
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

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
