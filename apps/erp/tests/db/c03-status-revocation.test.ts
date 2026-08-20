// C-03 proof (www) — suspending or blacklisting a user must revoke their LIVE
// session, not merely block the next login.
//
// The verification report showed: suspend a teacher → GET /me still 200 →
// POST /grades still 201, for up to the full 30-day session lifetime, because
// requireRole() read the role from a stateless JWT and the L1 epoch was never
// bumped by a status change.
//
// This drives the REAL www better-auth pipeline against the live DB:
//   - /sign-in/email (before-hooks + credential verify against the
//     trigger-mirrored account row) mints a real DB session + cookie,
//   - "a later request carrying an earlier session" is a real getSession
//     with the real cookie,
//   - the REAL platformBlacklistUser() / removeBlacklistEntry() services,
//   - the REAL prisma write updateUserStatus() performs, so the shipped
//     session-revocation extension bumps token_version — and the
//     users_revoke_sessions DB trigger DELETES the user's auth_sessions rows
//     in the same statement. HARD revocation, stronger than the old
//     per-request JWT epoch re-read.
// Nothing is mocked.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "@repo/database";
import {
  platformBlacklistUser,
  removeBlacklistEntry,
} from "@repo/server-core/services/blacklist/blacklist";
import { sessionFor, signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const PW = "Passw0rd!C03";

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
const statusOf = async (id: string) =>
  (await admin.query(`SELECT status FROM users WHERE id=$1`, [id])).rows[0].status as string;
// DB-level view of revocation: the trigger deletes rows, it doesn't flag them.
const sessionRowsOf = async (id: string) =>
  (await admin.query(`SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1`, [id]))
    .rows[0].n as number;

async function main() {
  const tag = "c03www-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash(PW, 10);

  const mk = async (email: string, role: string) =>
    (
      await admin.query(
        `INSERT INTO users (email, role, name, status, password_hash, updated_at)
         VALUES ($1, $2, $3, 'active', $4, now()) RETURNING id`,
        [email, role, email, hash],
      )
    ).rows[0].id as string;

  const emailT = `${tag}-teacher@x.io`; // suspended mid-session
  const emailS = `${tag}-student@x.io`; // blacklisted mid-session
  const emailC = `${tag}-control@x.io`; // control: never touched
  const emailA = `${tag}-admin@x.io`; // the acting super_admin

  const teacher = await mk(emailT, "teacher");
  const student = await mk(emailS, "student");
  const control = await mk(emailC, "student");
  const adminId = await mk(emailA, "super_admin");

  const cleanupUsers = [teacher, student, control, adminId];

  try {
    console.log("C-03 www session revocation —", tag);

    // ---------------------------------------------------------------- setup
    const authT = await signInDoor(emailT, PW);
    const authS = await signInDoor(emailS, PW);
    const authC = await signInDoor(emailC, PW);
    assert(
      authT.ok &&
        (authT.user.id as string) === teacher &&
        authS.ok &&
        (authS.user.id as string) === student &&
        authC.ok &&
        (authC.user.id as string) === control,
      "all three accounts log in while active",
    );
    if (!authT.ok || !authS.ok || !authC.ok) throw new Error("cannot continue without sessions");

    assert(
      (await sessionFor(authT.cookie))?.userId === teacher &&
        (await sessionFor(authS.cookie))?.userId === student &&
        (await sessionFor(authC.cookie))?.userId === control,
      "baseline: every live session is accepted before any status change",
    );

    // -------------------------------------------------- 1) SUSPEND a teacher
    // The exact write updateUserStatus() performs, through the shipped client
    // (so the session-revocation extension is what does the bump, and the
    // users_revoke_sessions trigger is what deletes the session rows).
    const verBefore = await versionOf(teacher);
    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: teacher }, data: { status: "suspended" } }),
    );
    assert((await statusOf(teacher)) === "suspended", "suspend: users.status = 'suspended'");
    assert(
      (await versionOf(teacher)) === verBefore + 1,
      "suspend: token_version bumped (L1 epoch reused, no parallel session store)",
    );
    assert(
      (await sessionFor(authT.cookie)) === null,
      "suspend: the VERY NEXT request on the pre-suspension session is rejected",
    );
    assert(
      (await sessionRowsOf(teacher)) === 0,
      "suspend: the teacher's auth_sessions rows are DELETED (hard revocation)",
    );
    const relogin = await signInDoor(emailT, PW);
    assert(
      !relogin.ok && relogin.message === "ACCOUNT_INACTIVE",
      "suspend: the suspended account cannot log back in either (typed ACCOUNT_INACTIVE)",
    );

    // ------------------------------------------------ 2) BLACKLIST a student
    // Real service — the same one POST /api/v1/admin/users/[id]/blacklist calls.
    const entry = (await platformBlacklistUser(student, "C-03 proof", adminId)) as {
      id: string;
    };
    assert((await statusOf(student)) === "blacklisted", "blacklist: users.status = 'blacklisted'");
    assert(
      (await versionOf(student)) === 1,
      "blacklist: token_version bumped by the real service path",
    );
    assert(
      (await sessionFor(authS.cookie)) === null,
      "blacklist: the VERY NEXT request on the pre-blacklist session is rejected",
    );
    assert(
      (await sessionRowsOf(student)) === 0,
      "blacklist: the student's auth_sessions rows are DELETED",
    );

    // ------------------------------------------------- 3) CONTROL untouched
    assert(
      (await sessionFor(authC.cookie))?.userId === control,
      "control: an unrelated active session is NOT logged out (no spurious logout)",
    );
    assert((await versionOf(control)) === 0, "control: token_version never moved");

    // --------------------------------------------------------- 4) REVERSALS
    // Un-suspend, the way updateUserStatus(status:'active') does.
    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: teacher }, data: { status: "active" } }),
    );
    const verAfterUnsuspend = await versionOf(teacher);
    assert(
      verAfterUnsuspend === verBefore + 1,
      "reinstate: reactivation does NOT bump again (nothing to revoke)",
    );
    const authT2 = await signInDoor(emailT, PW);
    assert(
      authT2.ok && (authT2.user.id as string) === teacher,
      "reinstate: the teacher can log in again cleanly",
    );
    if (!authT2.ok) throw new Error("cannot continue without the reinstated session");
    // Sessions are DB rows now, not JWTs — there is no epoch claim to stamp.
    // Nearest equivalent of "the fresh login carries the CURRENT epoch": the
    // login neither bumped the epoch nor was its new session row revoked.
    assert(
      (await versionOf(teacher)) === verAfterUnsuspend && (await sessionRowsOf(teacher)) >= 1,
      "reinstate: the fresh login lives under the CURRENT epoch (no bump, live session row)",
    );
    assert(
      (await sessionFor(authT2.cookie))?.userId === teacher,
      "reinstate: the freshly-issued session is accepted on subsequent requests",
    );
    assert(
      (await sessionFor(authT.cookie)) === null,
      "reinstate: the OLD pre-suspension session stays dead (revocation is not undone)",
    );

    // Lift the blacklist via the real service (super_admin actor).
    await removeBlacklistEntry(entry.id, {
      id: adminId,
      role: "super_admin",
      email: emailA,
      name: emailA,
    } as never);
    assert((await statusOf(student)) === "active", "lift blacklist: status back to 'active'");
    const authS2 = await signInDoor(emailS, PW);
    assert(
      authS2.ok && (authS2.user.id as string) === student,
      "lift blacklist: the student can log in again cleanly",
    );
    if (authS2.ok) {
      assert(
        (await sessionFor(authS2.cookie))?.userId === student,
        "lift blacklist: the new session is accepted",
      );
    }

    // ------------------------- 5) CASCADE path (updateMany) is covered too
    // rejectCenter / blacklistCenter / toggleCenter suspend a center's admins
    // with updateMany — the extension must bump every matched row (and the
    // trigger must clear every matched user's sessions).
    const cascadeA = await mk(`${tag}-ca@x.io`, "center_admin");
    const cascadeB = await mk(`${tag}-cb@x.io`, "center_admin");
    cleanupUsers.push(cascadeA, cascadeB);
    const cascadeAuth = await signInDoor(`${tag}-ca@x.io`, PW);
    assert(
      cascadeAuth.ok && (cascadeAuth.user.id as string) === cascadeA,
      "cascade: a center admin logs in while active",
    );
    if (!cascadeAuth.ok) throw new Error("cannot continue without the cascade session");
    await withPlatformContext((tx) =>
      tx.user.updateMany({
        where: { id: { in: [cascadeA, cascadeB] } },
        data: { status: "suspended" },
      }),
    );
    assert(
      (await versionOf(cascadeA)) === 1 && (await versionOf(cascadeB)) === 1,
      "cascade: updateMany bumps the epoch for EVERY matched center admin",
    );
    assert(
      (await sessionFor(cascadeAuth.cookie)) === null &&
        (await sessionRowsOf(cascadeA)) === 0,
      "cascade: a center-admin session dies on the next request too (rows deleted)",
    );

    // ---------------------------------- 6) soft-delete revokes as well
    const doomed = await mk(`${tag}-del@x.io`, "student");
    cleanupUsers.push(doomed);
    const doomedAuth = await signInDoor(`${tag}-del@x.io`, PW);
    assert(doomedAuth.ok, "soft-delete: the user logs in while active");
    if (!doomedAuth.ok) throw new Error("cannot continue without the doomed session");
    await withPlatformContext((tx) =>
      tx.user.updateMany({
        where: { id: doomed },
        data: { status: "deleted", deletedAt: new Date() },
      }),
    );
    assert(
      (await sessionFor(doomedAuth.cookie)) === null && (await sessionRowsOf(doomed)) === 0,
      "soft-delete: the deleted user's live session is rejected on the next request",
    );

    // -------------------- 7) existing guards are still intact (no weakening)
    const wrongPw = await signInDoor(emailC, "WrongPassword!");
    assert(
      !wrongPw.ok && wrongPw.message === "Invalid email or password",
      "guard intact: a wrong password still fails generically (H5 path untouched)",
    );
    const nobody = await signInDoor(`${tag}-nobody@x.io`, PW);
    assert(
      !nobody.ok && nobody.message === "USER_NOT_FOUND",
      "guard intact: an unknown email still fails (typed USER_NOT_FOUND)",
    );
    // The old proof forged a JWT with a mismatched `ver` claim. Sessions are
    // opaque DB-backed cookies now — the nearest check: a TAMPERED cookie
    // (mangled token/signature) never resolves to a session.
    const forged = authC.cookie.replace(/=([^;]+)/g, "=x$1");
    assert(
      (await sessionFor(forged)) === null,
      "guard intact: a tampered session cookie is rejected (no session row matches)",
    );
    assert(
      (await sessionFor(authC.cookie))?.userId === control,
      "control: still logged in at the end of the run",
    );
  } finally {
    await admin.query(`DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(
      `DELETE FROM blacklist_entries WHERE target_id = ANY($1::uuid[]) OR imposed_by_id = ANY($1::uuid[])`,
      [cleanupUsers],
    );
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [cleanupUsers]);
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
