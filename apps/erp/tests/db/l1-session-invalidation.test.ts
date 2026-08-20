// L1 proof — a password reset must invalidate sessions issued BEFORE it,
// while a fresh login keeps working and unrelated sessions are untouched.
//
// Drives the REAL www better-auth pipeline end-to-end against the live DB:
//   - /sign-in/email (before-hooks + credential verify against the
//     trigger-mirrored account row) mints a real DB session + cookie,
//   - "a later request carrying an earlier session" is a real getSession
//     with the real cookie,
//   - the real resetPassword() service bumps users.token_version in-tx, and
//     the users_revoke_sessions DB trigger deletes the session rows — HARD
//     revocation, stronger than the old per-request JWT epoch re-read.
// No mocks anywhere.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { resetPassword } from "@/lib/services/auth/password-reset";
import { generateOpaqueToken, hashToken } from "@/lib/utils/random";
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

    // 0) The raw-SQL INSERT above already proved the mirror trigger: the
    //    credential account row must exist for the sign-in below to succeed.
    const mirrored = (
      await admin.query(
        `SELECT count(*)::int AS n FROM auth_accounts
          WHERE provider_id='credential' AND user_id = ANY($1::uuid[])`,
        [[userA, userB]],
      )
    ).rows[0].n as number;
    assert(mirrored === 2, "credential rows mirrored for raw-SQL user inserts");

    // 1) Login A + B (before any reset) — real sessions, real cookies.
    const authA = await signInDoor(emailA, OLD_PW);
    const authB = await signInDoor(emailB, OLD_PW);
    assert(authA.ok && (authA.user.id as string) === userA, "login A succeeds with old password");
    assert(authB.ok, "login B succeeds");
    if (!authA.ok || !authB.ok) throw new Error("cannot continue without sessions");

    // 2) Both sessions are valid BEFORE the reset.
    assert((await sessionFor(authA.cookie))?.userId === userA, "pre-reset: session A is accepted");
    assert((await sessionFor(authB.cookie))?.userId === userB, "pre-reset: session B is accepted");

    // 3) A resets their password (real service; bumps token_version in-tx,
    //    which fires the users_revoke_sessions trigger in the same statement).
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

    // 4) The pre-reset session A is now REJECTED (row deleted) — the core fix.
    assert(
      (await sessionFor(authA.cookie)) === null,
      "post-reset: session issued BEFORE the reset is rejected",
    );
    const rowsA = (
      await admin.query(`SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1`, [userA])
    ).rows[0].n as number;
    assert(rowsA === 0, "post-reset: A's session rows are DELETED (hard revocation)");

    // 5) The unrelated session B is UNAFFECTED.
    assert(
      (await sessionFor(authB.cookie))?.userId === userB,
      "post-reset: an unrelated session stays valid",
    );

    // 6) A fresh login with the NEW password works; the old one is dead.
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

    // 7) The reset also re-mirrored the credential row (trigger, not code).
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

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite l1-session-invalidation.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
