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

  const staff: Record<string, { id: string; email: string }> = {};
  for (const sub of ["receptionist", "manager", "center_accountant"] as const) {
    const u = await mk(sub, "center_staff");
    await withPlatformContext((tx) =>
      tx.centerStaff.create({ data: { centerId: fx.center.id, staffUserId: u.id, role: sub } }),
    );
    staff[sub] = u;
  }

  const teacher = await mk("teacher", "teacher");
  const student = await mk("student", "student");
  const parent = await mk("parent", "parent");
  const assistant = await mk("assistant", "assistant");
  const superAdmin = await mk("superadmin", "super_admin");
  const platformAccountant = await mk("platform-accountant", "accountant");

  try {
    console.log("\n1) center_staff logs in through BOTH doors, all three sub-roles");
    for (const sub of ["receptionist", "manager", "center_accountant"] as const) {
      const u = staff[sub]!;

      const na = await signInDoor(u.email, PW);
      assert(na.ok && (na.user.id as string) === u.id, `${sub}: browser door -> the same user`);

      const naSession = na.ok ? await sessionFor(na.cookie) : null;
      assert(naSession?.userId === u.id, `${sub}: the issued session authenticates later requests`);
      assert(
        naSession?.role === "center_staff" && naSession?.centerId === fx.center.id,
        `${sub}: the session claims carry role + the staff member's center`,
      );

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

    console.log("\n5) auth hardening intact");
    __resetRateLimiterForTests();

    const t0 = Date.now();
    const doorUnknown = await signInDoor(`${tag}-nobody@x.io`, PW);
    const tUnknown = Date.now() - t0;
    assert(
      !doorUnknown.ok && doorUnknown.message === "Invalid email or password",
      "H5 + AUTH-01: an unknown email fails with the SAME message as a wrong password",
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
    const t2 = Date.now();
    const doorSuper = await signInDoor(superAdmin.email, PW);
    assert(Date.now() - t2 > 15, "H5: the ineligible-role path runs bcrypt too (no fast reject)");
    assert(
      !doorSuper.ok && doorSuper.message === "Invalid email or password",
      "H5: an ineligible role is generic — the typed unknown-email answer never leaks app membership",
    );

    const rlEmail2 = `${tag}-rl2@x.io`;
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

    const shell = await mk("shell", "student", false);
    await admin.query(`UPDATE users SET status = 'shell' WHERE id = $1`, [shell.id]);
    assert(
      !(await signInDoor(shell.email, PW)).ok,
      "guard intact: a passwordless shell account is refused by the password door",
    );

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

assertDbEnv(["test"], { intent: "suite c04-login-parity.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
