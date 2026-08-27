import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "@repo/database";
import { WWW_LOGIN_ROLES, SUPERADMIN_LOGIN_ROLES } from "@repo/server-core/auth/login-policy";
import { sessionFor, signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const PW = "Passw0rd!C04sa";
const GENERIC = "Invalid email or password";

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

const sessionRows = async (ids: string[]) =>
  (
    await admin.query(`SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = ANY($1::uuid[])`, [
      ids,
    ])
  ).rows[0].n as number;

async function main() {
  const tag = "c04sa-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("C-04 back-office login boundary —", tag);
  const hash = await bcrypt.hash(PW, 10);

  const cleanupUsers: string[] = [];
  const mk = async (local: string, role: string) => {
    const id = (
      await admin.query(
        `INSERT INTO users (email, role, name, status, password_hash, updated_at)
         VALUES ($1, $2, $3, 'active', $4, now()) RETURNING id`,
        [`${tag}-${local}@x.io`, role, `${tag}-${local}`, hash],
      )
    ).rows[0].id as string;
    cleanupUsers.push(id);
    return { id, email: `${tag}-${local}@x.io`, role };
  };

  const center = await withPlatformContext((tx) =>
    tx.center.create({
      data: {
        name: tag + "-center",
        shortId: tag.slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    }),
  );

  const superAdmin = await mk("superadmin", "super_admin");
  const platformAccountant = await mk("accountant", "accountant");

  const wwwUsers: { id: string; email: string; role: string; label: string }[] = [];
  for (const role of ["center_admin", "teacher", "assistant", "parent", "student"] as const) {
    wwwUsers.push({ ...(await mk(role, role)), label: role });
  }
  for (const sub of ["receptionist", "manager", "center_accountant"] as const) {
    const u = await mk(sub, "center_staff");
    await withPlatformContext((tx) =>
      tx.centerStaff.create({ data: { centerId: center.id, staffUserId: u.id, role: sub } }),
    );
    wwwUsers.push({ ...u, label: `center_staff/${sub}` });
  }

  try {
    console.log("\n1) back-office roles still sign in");
    for (const [label, u] of [
      ["super_admin", superAdmin],
      ["accountant", platformAccountant],
    ] as const) {
      const auth = await signInDoor(u.email, PW);
      assert(auth.ok && (auth.user.id as string) === u.id, `${label}: sign-in -> the account`);
      if (auth.ok) {
        assert(
          (await sessionFor(auth.cookie))?.userId === u.id,
          `${label}: the session is accepted on subsequent requests`,
        );
      }
    }

    console.log("\n2) every www role is refused by the back-office door");
    for (const u of wwwUsers) {
      const auth = await signInDoor(u.email, PW);
      assert(
        !auth.ok && auth.message === GENERIC,
        `${u.label}: refused with the CORRECT password (generic H5 message)`,
      );
    }
    assert(
      wwwUsers.length === 8,
      `covered all 8 www principals (5 roles + 3 center_staff sub-roles), got ${wwwUsers.length}`,
    );

    assert(
      (await sessionRows(wwwUsers.map((u) => u.id))) === 0,
      "no refused www principal holds a session row (nothing to ride)",
    );

    console.log("\n3) the shared partition");
    assert(
      [...SUPERADMIN_LOGIN_ROLES].sort().join(",") === "accountant,super_admin",
      "shared policy: only super_admin + accountant reach this app",
    );
    assert(
      [...WWW_LOGIN_ROLES].filter((r) => SUPERADMIN_LOGIN_ROLES.has(r)).length === 0,
      "shared policy: no role is on both sides (widening www cannot widen here)",
    );

    console.log("\n4) auth hardening intact on the back-office door");

    const t0 = Date.now();
    const unknown = await signInDoor(`${tag}-nobody@x.io`, PW);
    const tUnknown = Date.now() - t0;
    assert(!unknown.ok && unknown.message === GENERIC, "H5: unknown email refused (generic)");
    const t1 = Date.now();
    const wrong = await signInDoor(superAdmin.email, "WrongPassword!");
    const tWrong = Date.now() - t1;
    assert(!wrong.ok && wrong.message === GENERIC, "H5: wrong password refused (generic)");
    assert(
      tUnknown > 15 && tWrong > 15,
      `H5: both paths ran bcrypt (unknown ${tUnknown}ms, wrong-password ${tWrong}ms)`,
    );

    const victim = await mk("c2victim", "super_admin");
    for (let i = 0; i < 6; i++) await signInDoor(victim.email, "nope");
    const throttled = await signInDoor(victim.email, PW);
    assert(
      !throttled.ok && throttled.message === "RATE_LIMITED",
      "C2: after the burst the CORRECT password is throttled too",
    );
    const unaffected = await signInDoor(superAdmin.email, PW);
    assert(
      unaffected.ok && (unaffected.user.id as string) === superAdmin.id,
      "C2: an unrelated staff account is unaffected (per-email bucket)",
    );

    const live = await mk("revoke", "accountant");
    const liveAuth = await signInDoor(live.email, PW);
    assert(liveAuth.ok, "L1/C-03: the fresh accountant signs in");
    if (!liveAuth.ok) throw new Error("cannot continue without a live session");
    assert(
      (await sessionFor(liveAuth.cookie))?.userId === live.id,
      "L1/C-03: baseline session accepted",
    );
    await admin.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [live.id]);
    assert(
      (await sessionFor(liveAuth.cookie)) === null,
      "L1: a bumped epoch revokes the back-office session on the next request",
    );
    assert(
      (await sessionRows([live.id])) === 0,
      "L1: the session rows are DELETED (hard revocation)",
    );
    const liveAuth2 = await signInDoor(live.email, PW);
    if (!liveAuth2.ok) throw new Error("cannot continue without a fresh session");
    assert(
      (await sessionFor(liveAuth2.cookie))?.userId === live.id,
      "L1: a fresh login works again",
    );
    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: live.id }, data: { status: "suspended" } }),
    );
    assert(
      (await sessionFor(liveAuth2.cookie)) === null,
      "C-03: suspending the accountant kills the live back-office session",
    );
    assert(
      (await sessionRows([live.id])) === 0,
      "C-03: the suspended accountant's session rows are DELETED too",
    );
    const suspendedLogin = await signInDoor(live.email, PW);
    assert(
      !suspendedLogin.ok && suspendedLogin.message === GENERIC,
      "C-03: and the suspended account cannot log back in (generic H5 message)",
    );
  } finally {
    await admin.query(`DELETE FROM center_staff WHERE staff_user_id = ANY($1::uuid[])`, [
      cleanupUsers,
    ]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE user_id = ANY($1::uuid[])`, [
      cleanupUsers,
    ]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM centers WHERE id = $1`, [center.id]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite c04-login-boundary.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
