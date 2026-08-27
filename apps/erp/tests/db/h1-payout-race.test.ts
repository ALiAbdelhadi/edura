import { testPool } from "../../../../packages/database/scripts/test-pool";
import { requestTeacherPayout } from "@/lib/services/finance/teacher-wallet";
import { requestCenterPayout } from "@/lib/services/finance/center-wallet";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const SEED_TEACHER = "47b21cb0-a166-5876-901f-2cc4ef9f8487";
const SEED_CENTER = "24a08f67-c5be-4073-9f7a-76d0bf688e4d";
const SEED_CENTER_ADMIN = "2d4b57cf-0dfc-48aa-aff9-ad2ae2673353";
let HOSSAM = SEED_TEACHER;
let CENTER = SEED_CENTER;
let CENTER_ADMIN = SEED_CENTER_ADMIN;
const BAL = 10_000; // 100 EGP

async function resolveFixtures() {
  const seededTeacher = await admin.query(
    `SELECT user_id FROM teacher_profiles WHERE user_id=$1`, [SEED_TEACHER]);
  if (seededTeacher.rows.length === 0) {
    const any = await admin.query(`SELECT user_id FROM teacher_profiles ORDER BY user_id LIMIT 1`);
    if (any.rows.length === 0) throw new Error("no teacher_profiles to run the H1 proof against");
    HOSSAM = any.rows[0].user_id as string;
  }
  const seededCenter = await admin.query(
    `SELECT user_id FROM center_admin_profiles WHERE center_id=$1 AND user_id=$2`,
    [SEED_CENTER, SEED_CENTER_ADMIN]);
  if (seededCenter.rows.length === 0) {
    const any = await admin.query(
      `SELECT cap.center_id, cap.user_id FROM center_admin_profiles cap
         JOIN centers c ON c.id = cap.center_id
        ORDER BY cap.center_id LIMIT 1`);
    if (any.rows.length === 0) throw new Error("no center with an admin to run the H1 proof against");
    CENTER = any.rows[0].center_id as string;
    CENTER_ADMIN = any.rows[0].user_id as string;
  }
  console.log(
    `  fixtures: teacher=${HOSSAM}${HOSSAM === SEED_TEACHER ? " (seed)" : " (resolved)"}, ` +
      `center=${CENTER}${CENTER === SEED_CENTER ? " (seed)" : " (resolved)"}`,
  );
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
  const orig = (
    await admin.query(
      `SELECT wallet_balance FROM ${balanceTable} WHERE ${balanceKey}=$1`,
      [beneficiaryId],
    )
  ).rows[0].wallet_balance as number;

  await admin.query(
    `DELETE FROM payouts WHERE beneficiary_id=$1 AND status IN ('pending','approved')`,
    [beneficiaryId],
  );
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

  await admin.query(
    `DELETE FROM payouts WHERE beneficiary_id=$1 AND status IN ('pending','approved')`,
    [beneficiaryId],
  );
  await admin.query(
    `UPDATE ${balanceTable} SET wallet_balance=$2 WHERE ${balanceKey}=$1`,
    [beneficiaryId, orig],
  );
  return pass;
}

async function main() {
  await resolveFixtures();
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
  process.exit(teacherPass && centerPass ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite h1-payout-race.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
