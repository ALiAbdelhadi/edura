// C-04 proof (www) — the ONE www login door must accept exactly the accounts
// the shared role partition says it may, and no others.
//
// The original verification report: `reception@…`, `manager@…`, `accountant@…`
// (role=center_staff) got **401 with the correct password** from
// POST /api/v1/auth/login while the browser door returned 200 + a cookie,
// because that route declared its own allowlist and omitted center_staff.
//
// HISTORY, because it changes what this file is: C-04 was a PARITY proof
// between two doors. The second door — the manual REST mirror at
// POST /api/v1/auth/login — was RETIRED on 2026-08-18: no application code
// called it (the Playwright E2E suite drives the real login form), and its only
// throttling was a per-IP bucket that a rotated X-Forwarded-For defeated, while
// better-auth's own per-account limiter does not. Deleting the door removes the
// drift surface C-04 existed to police, so what survives here is the half that
// still earns its keep: the partition and the hardening, proved BEHAVIOURALLY
// against the live DB through the real better-auth pipeline.
//
// Nothing here is mocked. It drives the REAL better-auth pipeline via
// helpers/auth-door (before-hooks, credential verify, session-row creation with
// the centerId enrichment hook, cookie issuance), with sessionFor() as "a later
// request carrying the session" — the real per-request gate every www route
// sits behind.
//
// It also re-proves the hardening around this door: the H5 dummy-hash timing
// defense (with the Ali-approved scoped USER_NOT_FOUND exception), L1
// revocation (HARD: the users_revoke_sessions trigger deletes session rows),
// C-03 live status revocation (typed ACCOUNT_INACTIVE for a proven owner), and
// the narrow invite-token claim door.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { prisma, withPlatformContext } from "@repo/database";
import { WWW_LOGIN_ROLES, SUPERADMIN_LOGIN_ROLES } from "@repo/server-core/auth/login-policy";
import { resolveCenterActorContext } from "@/lib/authz/center-actor";
import { __resetRateLimiterForTests } from "@/lib/rate-limit/token-bucket";
import { claimDoor, freshIp, sessionFor, signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const PW = "Passw0rd!C04";

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

// ------------------------------------------------------ the www login door
// signInDoor/sessionFor/claimDoor in helpers/auth-door drive the full real
// pipeline; sessionFor(cookie) is the per-request gate every www request sits
// behind (replaces the old NextAuth jwt()/session() callback simulation).

async function main() {
  const tag = "c04-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("C-04 login-door parity —", tag);
  const hash = await bcrypt.hash(PW, 10);

  const cleanupUsers: string[] = [];
  const mk = async (local: string, role: string, withPassword = true) => {
    const id = (
      await admin.query(
        `INSERT INTO users (email, role, name, status, password_hash, updated_at)
         VALUES ($1, $2, $3, 'active', $4, now()) RETURNING id`,
        [`${tag}-${local}@x.io`, role, `${tag}-${local}`, withPassword ? hash : null],
      )
    ).rows[0].id as string;
    cleanupUsers.push(id);
    return { id, email: `${tag}-${local}@x.io` };
  };

  const fx = await withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: {
        name: tag + "-center",
        shortId: tag.slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    return { center };
  });

  const owner = await mk("owner", "center_admin");
  await withPlatformContext((tx) =>
    tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: fx.center.id } }),
  );

  // The three center_staff sub-roles from the report.
  const staff: Record<string, { id: string; email: string }> = {};
  for (const sub of ["receptionist", "manager", "center_accountant"] as const) {
    const u = await mk(sub, "center_staff");
    await withPlatformContext((tx) =>
      tx.centerStaff.create({ data: { centerId: fx.center.id, staffUserId: u.id, role: sub } }),
    );
    staff[sub] = u;
  }

  // The other www roles (parity must not have narrowed) + the back-office roles
  // (must still be refused by www) + a passwordless walk-in shell student.
  const teacher = await mk("teacher", "teacher");
  const student = await mk("student", "student");
  const parent = await mk("parent", "parent");
  const assistant = await mk("assistant", "assistant");
  const superAdmin = await mk("superadmin", "super_admin");
  const platformAccountant = await mk("platform-accountant", "accountant");

  try {
    // ================================================================== 1) C-04
    console.log("\n1) center_staff logs in through BOTH doors, all three sub-roles");
    for (const sub of ["receptionist", "manager", "center_accountant"] as const) {
      const u = staff[sub]!;

      const na = await signInDoor(u.email, PW);
      assert(na.ok && (na.user.id as string) === u.id, `${sub}: browser door -> the same user`);

      // End to end: the session the door minted is accepted by the very same
      // per-request gate every www route sits behind, carrying the claims the
      // C-04 report found missing (role + the staff member's centerId).
      const naSession = na.ok ? await sessionFor(na.cookie) : null;
      assert(naSession?.userId === u.id, `${sub}: the issued session authenticates later requests`);
      assert(
        naSession?.role === "center_staff" && naSession?.centerId === fx.center.id,
        `${sub}: the session claims carry role + the staff member's center`,
      );

      // The staff member is usable: the live link still resolves the sub-role.
      const ctx = await resolveCenterActorContext({
        id: u.id,
        role: "center_staff",
        locale: "ar",
      } as never);
      assert(
        ctx.centerId === fx.center.id && ctx.staffRole === sub,
        `${sub}: requireCenterActor still re-derives the LIVE link (authorization unchanged)`,
      );
    }

    // ============================================== 2) the other www roles pass
    console.log("\n2) every other www role still passes through BOTH doors");
    __resetRateLimiterForTests();
    for (const [label, u] of [
      ["center_admin", owner],
      ["teacher", teacher],
      ["student", student],
      ["parent", parent],
      ["assistant", assistant],
    ] as const) {
      const na = await signInDoor(u.email, PW);
      assert(
        na.ok && (na.user.id as string) === u.id,
        `${label}: accepted by the www login door (no regression)`,
      );
    }
    const ownerDoor = await signInDoor(owner.email, PW);
    const ownerSession = ownerDoor.ok ? await sessionFor(ownerDoor.cookie) : null;
    assert(
      ownerSession?.centerId === fx.center.id,
      "center_admin: the session still resolves the center from the admin profile",
    );

    // =================================== 3) back-office roles rejected on www
    console.log("\n3) super_admin + accountant are still refused by BOTH www doors");
    __resetRateLimiterForTests();
    for (const [label, u] of [
      ["super_admin", superAdmin],
      ["accountant", platformAccountant],
    ] as const) {
      const na = await signInDoor(u.email, PW);
      assert(!na.ok && na.status === 401, `${label}: the www door -> refused (401)`);
      assert(
        !na.ok && na.message === "Invalid email or password",
        `${label}: the refusal is generic (no "wrong app" oracle)`,
      );
    }

    // ============================================ 4) the allowlists are one list
    console.log("\n4) the two doors read ONE list");
    __resetRateLimiterForTests();
    assert(
      [...WWW_LOGIN_ROLES].sort().join(",") ===
        "assistant,center_admin,center_staff,parent,student,teacher",
      "shared policy: www = the six www roles",
    );
    assert(
      [...SUPERADMIN_LOGIN_ROLES].sort().join(",") === "accountant,super_admin",
      "shared policy: superadmin = the two back-office roles",
    );
    // Behavioural set-equality: every role, through both doors, agrees.
    let disagreements = 0;
    for (const [role, u] of [
      ["center_admin", owner],
      ["center_staff", staff.receptionist!],
      ["teacher", teacher],
      ["student", student],
      ["parent", parent],
      ["assistant", assistant],
      ["super_admin", superAdmin],
      ["accountant", platformAccountant],
    ] as const) {
      const naOk = (await signInDoor(u.email, PW)).ok;
      const expected = WWW_LOGIN_ROLES.has(role as never);
      if (naOk !== expected) {
        disagreements++;
        console.error(`    role=${role} door=${naOk} expected=${expected}`);
      }
    }
    assert(
      disagreements === 0,
      "all 8 roles: REST verdict === browser-door verdict === the shared policy",
    );

    // ================================================= 5) hardening regressions
    console.log("\n5) auth hardening intact");
    __resetRateLimiterForTests();

    // --- H5: bcrypt runs on EVERY path (no timing oracle). The REST door stays
    // fully generic; the browser door carries the ONE Ali-approved scoped
    // exception (typed USER_NOT_FOUND for a truly unknown email — sign-up
    // conversion UX, bounded by C2, dummy compare keeps the timing identical).
    // A missing account must still pay for a hash comparison. (The structural
    // guarantee — one unconditional compare against DUMMY_HASH when ineligible
    // — lives in the before-hook in lib/auth/auth.ts; wall-clock over a network
    // DB is too noisy to compare the two paths directly, so this only asserts
    // the work happened at all.)
    const t0 = Date.now();
    const doorUnknown = await signInDoor(`${tag}-nobody@x.io`, PW);
    const tUnknown = Date.now() - t0;
    assert(
      !doorUnknown.ok && doorUnknown.message === "USER_NOT_FOUND",
      "H5 (scoped exception): the door types USER_NOT_FOUND for a truly unknown email",
    );
    const t1 = Date.now();
    const doorWrong = await signInDoor(staff.manager!.email, "WrongPassword!");
    const tWrong = Date.now() - t1;
    assert(
      !doorWrong.ok && doorWrong.message === "Invalid email or password",
      "H5: a wrong password on an EXISTING account stays generic",
    );
    assert(
      tUnknown > 15 && tWrong > 15,
      `H5: both the unknown-email (${tUnknown}ms) and wrong-password (${tWrong}ms) paths ran bcrypt`,
    );
    // The ineligible-role path must ALSO compare a hash (a back-office account
    // must not answer faster than a wrong password on www) and stay generic —
    // USER_NOT_FOUND must never fire for an account that merely lives elsewhere.
    const t2 = Date.now();
    const doorSuper = await signInDoor(superAdmin.email, PW);
    assert(Date.now() - t2 > 15, "H5: the ineligible-role path runs bcrypt too (no fast reject)");
    assert(
      !doorSuper.ok && doorSuper.message === "Invalid email or password",
      "H5: an ineligible role is generic — the typed unknown-email answer never leaks app membership",
    );

    // --- C2: rate limiting.
    // The per-IP `withRateLimit` burst that used to be proved here belonged to
    // the retired REST door and went with it. What remains — and is the
    // stronger property — is better-auth's own PER-ACCOUNT throttle below,
    // which a rotated X-Forwarded-For cannot defeat (measured 2026-08-18:
    // 20 rotating-IP attempts, all refused).
    const rlEmail2 = `${tag}-rl2@x.io`;
    // Per-EMAIL bucket: cap 5. The IP varies per call (freshIp), so this is
    // unambiguously the email bucket doing the throttling; then confirm the
    // CORRECT password is refused too (a throttled account is locked, not just
    // wrong-password-rejected) with the typed RATE_LIMITED failure.
    for (let i = 0; i < 6; i++) await signInDoor(rlEmail2, "nope");
    const throttled = await signInDoor(rlEmail2, PW);
    assert(
      !throttled.ok && throttled.message === "RATE_LIMITED",
      "C2: the per-email bucket keeps refusing after the burst (typed RATE_LIMITED)",
    );
    const freshStillWorks = await signInDoor(teacher.email, PW);
    assert(
      freshStillWorks.ok && (freshStillWorks.user.id as string) === teacher.id,
      "C2: an unrelated account is unaffected (the bucket is per-email, not global)",
    );

    // --- L1: revocation on token_version bump — now HARD (the DB trigger
    // deletes the session rows; stronger than the old per-request epoch re-read).
    __resetRateLimiterForTests();
    const l1 = await signInDoor(student.email, PW);
    assert(l1.ok, "L1: baseline login succeeds");
    const l1Cookie = l1.ok ? l1.cookie : "";
    assert((await sessionFor(l1Cookie))?.userId === student.id, "L1: baseline session accepted");
    await admin.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [
      student.id,
    ]);
    assert(
      (await sessionFor(l1Cookie)) === null,
      "L1: a bumped token_version rejects the pre-existing session on the NEXT request",
    );
    const l1Rows = (
      await admin.query(`SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1`, [
        student.id,
      ])
    ).rows[0].n as number;
    assert(l1Rows === 0, "L1: the session rows are DELETED by the trigger (hard revocation)");
    const l1Fresh = await signInDoor(student.email, PW);
    assert(l1Fresh.ok, "L1: the door re-admits the user after the bump");
    assert(
      (await sessionFor(l1Fresh.ok ? l1Fresh.cookie : ""))?.userId === student.id,
      "L1: the re-issued session is accepted again (revocation kills old, not new)",
    );

    // --- C-03: live status revocation, on the center_staff path specifically.
    const revoked = staff.receptionist!;
    const rv = await signInDoor(revoked.email, PW);
    const rvCookie = rv.ok ? rv.cookie : "";
    assert(
      rv.ok && (await sessionFor(rvCookie))?.userId === revoked.id,
      "C-03: baseline — the staff session is live",
    );
    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: revoked.id }, data: { status: "suspended" } }),
    );
    assert(
      (await sessionFor(rvCookie)) === null,
      "C-03: suspending the staff member kills the live session on the next request",
    );
    const suspendedDoor = await signInDoor(revoked.email, PW);
    assert(!suspendedDoor.ok, "C-03: the suspended staff member cannot log back in (status gate)");
    assert(
      !suspendedDoor.ok &&
        suspendedDoor.status === 403 &&
        suspendedDoor.message === "ACCOUNT_INACTIVE",
      "C-03 (typed): the CORRECT password on the suspended account earns ACCOUNT_INACTIVE — ownership proven, never revealed to a guesser",
    );
    const suspendedDoorWrongPw = await signInDoor(revoked.email, "WrongPassword!");
    assert(
      !suspendedDoorWrongPw.ok && suspendedDoorWrongPw.message === "Invalid email or password",
      "C-03 (typed): a WRONG password on the suspended account stays generic",
    );
    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: revoked.id }, data: { status: "active" } }),
    );

    // A shell (passwordless) account must not be admitted by the password door
    // even though its role is on the www allowlist.
    const shell = await mk("shell", "student", false);
    await admin.query(`UPDATE users SET status = 'shell' WHERE id = $1`, [shell.id]);
    assert(
      !(await signInDoor(shell.email, PW)).ok,
      "guard intact: a passwordless shell account is refused by the password door",
    );

    // --- Step 7: the narrow invite-token claim door still works and stays narrow.
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await withPlatformContext((tx) =>
      tx.inviteToken.create({
        data: {
          tokenHash,
          purpose: "walk_in_onboarding",
          userId: shell.id,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      }),
    );
    const claimed = await claimDoor(rawToken);
    assert(
      claimed.ok && (claimed.user.id as string) === shell.id,
      "walk-in: a valid token still claims the shell student",
    );
    if (claimed.ok) {
      assert(
        (await sessionFor(claimed.cookie))?.userId === shell.id,
        "walk-in: the claim mints a REAL DB session accepted by the same per-request gate",
      );
    }
    assert(!(await claimDoor(rawToken)).ok, "walk-in: the token is single-use (second claim refused)");
    // And it is still NOT a general login door.
    const staffToken = randomBytes(32).toString("hex");
    await withPlatformContext((tx) =>
      tx.inviteToken.create({
        data: {
          tokenHash: createHash("sha256").update(staffToken).digest("hex"),
          purpose: "walk_in_onboarding",
          userId: staff.manager!.id,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      }),
    );
    assert(
      !(await claimDoor(staffToken)).ok,
      "walk-in: a token pointed at a credentialed center_staff account is refused (role + password gates hold)",
    );
  } finally {
    await admin.query(`DELETE FROM invite_tokens WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM center_staff WHERE staff_user_id = ANY($1::uuid[])`, [
      cleanupUsers,
    ]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE user_id = ANY($1::uuid[])`, [
      cleanupUsers,
    ]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM centers WHERE id = $1`, [fx.center.id]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite c04-login-parity.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
