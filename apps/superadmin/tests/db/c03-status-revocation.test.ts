// C-03 proof (superadmin) — the same revocation must hold in the back-office
// app, whose sessions are separate cookies + a separate signing secret but
// share the users table and the L1 token_version epoch.
//
// Drives the REAL apps/superadmin better-auth pipeline against the live DB:
//   - /sign-in/email (before-hook: C2 limits + C-04 partition + full H5)
//     mints a real DB session row + cookie,
//   - "a later request" is a real getSession with the real cookie,
//   - the REAL updateUserStatus() service — the one
//     PATCH /api/v1/admin/users/[id]/permissions calls — bumps token_version,
//     and the users_revoke_sessions DB trigger DELETES the session rows in the
//     same statement (hard revocation, stronger than the old per-request JWT
//     epoch re-read).
import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import { updateUserStatus } from "@/lib/services/admin/platform";
import { sessionFor, signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const PW = "Passw0rd!C03";
const GENERIC = "Invalid email or password"; // full H5: every refusal is this

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

const versionOf = async (id: string) =>
  (await admin.query(`SELECT token_version FROM users WHERE id=$1`, [id])).rows[0]
    .token_version as number;

const sessionRows = async (id: string) =>
  (await admin.query(`SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1`, [id]))
    .rows[0].n as number;

async function main() {
  const tag = "c03sa-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash(PW, 10);

  const mk = async (email: string, role: string) =>
    (
      await admin.query(
        `INSERT INTO users (email, role, name, status, password_hash, updated_at)
         VALUES ($1, $2, $3, 'active', $4, now()) RETURNING id`,
        [email, role, email, hash],
      )
    ).rows[0].id as string;

  const emailAcct = `${tag}-accountant@x.io`; // suspended mid-session
  const emailCtl = `${tag}-super@x.io`; // control staff session + the actor
  const emailTeacher = `${tag}-teacher@x.io`; // www user acted on by the service

  const accountant = await mk(emailAcct, "accountant");
  const superAdmin = await mk(emailCtl, "super_admin");
  const teacher = await mk(emailTeacher, "teacher");
  const ids = [accountant, superAdmin, teacher];

  try {
    console.log("C-03 superadmin session revocation —", tag);

    const authAcct = await signInDoor(emailAcct, PW);
    const authCtl = await signInDoor(emailCtl, PW);
    assert(
      authAcct.ok &&
        (authAcct.user.id as string) === accountant &&
        authCtl.ok &&
        (authCtl.user.id as string) === superAdmin,
      "staff accounts log in while active",
    );
    if (!authAcct.ok || !authCtl.ok) throw new Error("cannot continue without sessions");

    assert(
      (await sessionFor(authAcct.cookie))?.userId === accountant &&
        (await sessionFor(authCtl.cookie))?.userId === superAdmin,
      "baseline: both back-office sessions are accepted",
    );

    // --- the real admin service, exactly as the permissions endpoint calls it
    await updateUserStatus(accountant, "suspended", superAdmin);
    assert(
      (await versionOf(accountant)) === 1,
      "updateUserStatus('suspended') bumps the epoch via the shipped service path",
    );
    assert(
      (await sessionFor(authAcct.cookie)) === null,
      "the suspended accountant's VERY NEXT back-office request is rejected",
    );
    assert(
      (await sessionRows(accountant)) === 0,
      "the accountant's session rows are DELETED (users_revoke_sessions trigger)",
    );
    const relogin = await signInDoor(emailAcct, PW);
    assert(
      !relogin.ok && relogin.message === GENERIC,
      "the suspended accountant cannot log back in (generic H5 message)",
    );

    // --- the acting super_admin is untouched
    assert(
      (await sessionFor(authCtl.cookie))?.userId === superAdmin,
      "control: the acting super_admin's session is unaffected",
    );
    assert((await versionOf(superAdmin)) === 0, "control: super_admin epoch never moved");

    // --- reversal
    await updateUserStatus(accountant, "active", superAdmin);
    assert(
      (await versionOf(accountant)) === 1,
      "reinstate: reactivation does not bump again",
    );
    const authAcct2 = await signInDoor(emailAcct, PW);
    assert(
      authAcct2.ok && (authAcct2.user.id as string) === accountant,
      "reinstate: the accountant logs in again cleanly",
    );
    if (authAcct2.ok) {
      assert(
        (await sessionFor(authAcct2.cookie))?.userId === accountant,
        "reinstate: the fresh back-office session is accepted",
      );
    }
    assert(
      (await sessionFor(authAcct.cookie)) === null,
      "reinstate: the pre-suspension session stays dead (row deleted, never restored)",
    );

    // --- the same service suspending a www role revokes THAT app's session too
    // (shared users table + shared epoch + shared auth_sessions trigger; the
    //  www-side gate is proven in apps/www/tests/db/c03-status-revocation.test.ts).
    await updateUserStatus(teacher, "suspended", superAdmin);
    assert(
      (await versionOf(teacher)) === 1,
      "cross-app: suspending a www teacher from the back office bumps their epoch",
    );

    // --- guards intact
    const wrong = await signInDoor(emailCtl, "WrongPassword!");
    assert(
      !wrong.ok && wrong.message === GENERIC,
      "guard intact: wrong password still fails with the generic message (H5 path untouched)",
    );
    assert(
      (await sessionFor(authCtl.cookie))?.userId === superAdmin,
      "control: still logged in at the end of the run",
    );
    // Nearest DB-level analogue of the old forged `ver: 99` claim check: the
    // epoch now lives ONLY in users.token_version, and a bump hard-deletes the
    // session rows via the users_revoke_sessions trigger — there is no client
    // -side claim left to forge.
    await admin.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [
      superAdmin,
    ]);
    assert(
      (await sessionFor(authCtl.cookie)) === null && (await sessionRows(superAdmin)) === 0,
      "guard intact: a raw L1 epoch bump still hard-revokes even a super_admin session",
    );
  } finally {
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite c03-status-revocation.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
