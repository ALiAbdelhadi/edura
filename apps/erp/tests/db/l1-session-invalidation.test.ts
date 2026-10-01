import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { resetPassword } from "@repo/server-core/services/auth/password-reset";
import { generateOpaqueToken, hashToken } from "@repo/server-core/utils/random";
import { sessionFor, signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const OLD_PW = "OldPassw0rd!";
const NEW_PW = "FreshPassw0rd!";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

async function main() {
  const tag = "l1test-" + Math.floor(Math.random() * 1e9).toString(36);
  const oldHash = await bcrypt.hash(OLD_PW, 10);
  const emailA = `${tag}-a@x.io`;
  const emailB = `${tag}-b@x.io`;

  const mk = async (email: string) =>
    (
      await admin.query(
        `INSERT INTO users (email, role, name, status, password_hash, updated_at)
         VALUES ($1, 'student', $2, 'active', $3, now()) RETURNING id`,
        [email, email, oldHash],
      )
    ).rows[0].id as string;

  const userA = await mk(emailA);
  const userB = await mk(emailB); // control: never reset

  try {
    console.log("L1 session-invalidation —", tag);

    const mirrored = (
      await admin.query(
        `SELECT count(*)::int AS n FROM auth_accounts
          WHERE provider_id='credential' AND user_id = ANY($1::uuid[])`,
        [[userA, userB]],
      )
    ).rows[0].n as number;
    assert(mirrored === 2, "credential rows mirrored for raw-SQL user inserts");

    const authA = await signInDoor(emailA, OLD_PW);
    const authB = await signInDoor(emailB, OLD_PW);
    assert(authA.ok && (authA.user.id as string) === userA, "login A succeeds with old password");
    assert(authB.ok, "login B succeeds");
    if (!authA.ok || !authB.ok) throw new Error("cannot continue without sessions");

    assert((await sessionFor(authA.cookie))?.userId === userA, "pre-reset: session A is accepted");
    assert((await sessionFor(authB.cookie))?.userId === userB, "pre-reset: session B is accepted");

    const resetToken = generateOpaqueToken();
    await admin.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [userA, hashToken(resetToken)],
    );
    await resetPassword(resetToken, NEW_PW);

    const ver = (
      await admin.query(`SELECT token_version FROM users WHERE id=$1`, [userA])
    ).rows[0].token_version as number;
    assert(ver === 1, "reset bumped A's token_version to 1");

    assert(
      (await sessionFor(authA.cookie)) === null,
      "post-reset: session issued BEFORE the reset is rejected",
    );
    const rowsA = (
      await admin.query(`SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1`, [userA])
    ).rows[0].n as number;
    assert(rowsA === 0, "post-reset: A's session rows are DELETED (hard revocation)");

    assert(
      (await sessionFor(authB.cookie))?.userId === userB,
      "post-reset: an unrelated session stays valid",
    );

    const stale = await signInDoor(emailA, OLD_PW);
    assert(!stale.ok, "old password no longer logs in");
    const authA2 = await signInDoor(emailA, NEW_PW);
    assert(authA2.ok && (authA2.user.id as string) === userA, "fresh login with the new password succeeds");
    if (authA2.ok) {
      assert(
        (await sessionFor(authA2.cookie))?.userId === userA,
        "post-reset: a freshly-issued session is accepted",
      );
    }

    const mirroredHash = (
      await admin.query(
        `SELECT a.password = u.password_hash AS in_sync
           FROM auth_accounts a JOIN users u ON u.id = a.user_id
          WHERE a.provider_id='credential' AND u.id=$1`,
        [userA],
      )
    ).rows[0].in_sync as boolean;
    assert(mirroredHash === true, "credential mirror follows the reset hash");
  } finally {
    await admin.query(`DELETE FROM password_reset_tokens WHERE user_id = ANY($1::uuid[])`, [
      [userA, userB],
    ]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
    await admin.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite l1-session-invalidation.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
