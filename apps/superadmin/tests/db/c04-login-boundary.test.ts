// C-04 proof (superadmin side) — the back-office door must stay CLOSED to every
// www role after the allowlists were merged into one shared partition
// (@repo/server-core/auth/login-policy).
//
// The www half of the proof is apps/www/tests/db/c04-login-parity.test.ts
// (center_staff now logs in through both www doors). This half asserts the
// other direction: that widening www did NOT widen the back office. It drives
// the REAL apps/superadmin authorize() + jwt()/session() callbacks against the
// live DB, one account per role, and re-checks the C2/H5/L1/C-03 hardening on
// this door too.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "@repo/database";
import { WWW_LOGIN_ROLES, SUPERADMIN_LOGIN_ROLES } from "@repo/server-core/auth/login-policy";
import { authOptions } from "@/lib/auth/options";

neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

const PW = "Passw0rd!C04sa";

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

const credProvider = (
  authOptions.providers[0] as unknown as {
    options: { authorize: (c: unknown, r: unknown) => Promise<Record<string, unknown> | null> };
  }
).options;

// The superadmin per-email bucket is deliberately tight (cap 5, refill 1/min),
// so every account here gets at most a couple of attempts and each call uses a
// fresh IP for the per-IP bucket (cap 10).
let ipCounter = 0;
const login = (email: string, password: string, ip?: string) =>
  credProvider.authorize(
    { email, password },
    { headers: { "x-forwarded-for": ip ?? `198.51.100.${(ipCounter += 1) % 250}` } },
  );

const mint = async (user: Record<string, unknown>) =>
  (await authOptions.callbacks!.jwt!({ token: {}, user } as never)) as Record<string, unknown>;

async function effectiveUserId(storedToken: Record<string, unknown>) {
  const token = await authOptions.callbacks!.jwt!({
    token: { ...storedToken },
    user: undefined,
  } as never);
  const session = (await authOptions.callbacks!.session!({
    session: { user: {} },
    token,
  } as never)) as { user?: { id?: string } };
  return session?.user?.id ?? null;
}

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

  // One account per www role. center_staff gets a real link, and the
  // center_accountant sub-role especially — its NAME is the trap: a center
  // accountant must never be confused with the platform `accountant` Role.
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
    // =========================================== 1) staff still get in
    console.log("\n1) back-office roles still sign in");
    for (const [label, u] of [
      ["super_admin", superAdmin],
      ["accountant", platformAccountant],
    ] as const) {
      const auth = await login(u.email, PW);
      assert(auth?.id === u.id, `${label}: authorize() -> the account`);
      assert(
        (await effectiveUserId(await mint(auth!))) === u.id,
        `${label}: the session is accepted on subsequent requests`,
      );
    }

    // ============================== 2) every www role is refused (the boundary)
    console.log("\n2) every www role is refused by the back-office door");
    for (const u of wwwUsers) {
      const auth = await login(u.email, PW);
      assert(auth === null, `${u.label}: refused with the CORRECT password`);
    }
    assert(
      wwwUsers.length === 8,
      `covered all 8 www principals (5 roles + 3 center_staff sub-roles), got ${wwwUsers.length}`,
    );

    // A www role must also be unable to RIDE a token: even a forged claim set
    // naming a www user is rejected by the per-request gate, because the epoch
    // read is by uid and the role never gets re-admitted here.
    const rider = wwwUsers[0]!;
    const forged = await mint({
      id: rider.id,
      role: "super_admin",
      locale: "ar",
      tokenVersion: 999,
    });
    assert(
      (await effectiveUserId(forged)) === null,
      "a forged back-office token naming a www user is rejected by the L1 epoch check",
    );

    // ================================= 3) the partition is the reason it holds
    console.log("\n3) the shared partition");
    assert(
      [...SUPERADMIN_LOGIN_ROLES].sort().join(",") === "accountant,super_admin",
      "shared policy: only super_admin + accountant reach this app",
    );
    assert(
      [...WWW_LOGIN_ROLES].filter((r) => SUPERADMIN_LOGIN_ROLES.has(r)).length === 0,
      "shared policy: no role is on both sides (widening www cannot widen here)",
    );

    // ================================================ 4) hardening on this door
    console.log("\n4) auth hardening intact on the back-office door");

    // H5: unknown email and wrong password both pay for a bcrypt compare.
    const t0 = Date.now();
    assert((await login(`${tag}-nobody@x.io`, PW)) === null, "H5: unknown email refused");
    const tUnknown = Date.now() - t0;
    const t1 = Date.now();
    assert(
      (await login(superAdmin.email, "WrongPassword!")) === null,
      "H5: wrong password refused",
    );
    const tWrong = Date.now() - t1;
    assert(
      tUnknown > 15 && tWrong > 15,
      `H5: both paths ran bcrypt (unknown ${tUnknown}ms, wrong-password ${tWrong}ms)`,
    );

    // C2: per-email bucket (cap 5, refill 1/min) — much tighter than www.
    const victim = await mk("c2victim", "super_admin");
    for (let i = 0; i < 6; i++) await login(victim.email, "nope");
    assert(
      (await login(victim.email, PW)) === null,
      "C2: after the burst the CORRECT password is throttled too",
    );
    assert(
      (await login(superAdmin.email, PW))?.id === superAdmin.id,
      "C2: an unrelated staff account is unaffected (per-email bucket)",
    );

    // L1 + C-03 on this door.
    const live = await mk("revoke", "accountant");
    const token = await mint((await login(live.email, PW))!);
    assert((await effectiveUserId(token)) === live.id, "L1/C-03: baseline session accepted");
    await admin.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [live.id]);
    assert(
      (await effectiveUserId(token)) === null,
      "L1: a bumped epoch revokes the back-office session on the next request",
    );
    const token2 = await mint((await login(live.email, PW))!);
    assert((await effectiveUserId(token2)) === live.id, "L1: a fresh login works again");
    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: live.id }, data: { status: "suspended" } }),
    );
    assert(
      (await effectiveUserId(token2)) === null,
      "C-03: suspending the accountant kills the live back-office session",
    );
    assert(
      (await login(live.email, PW)) === null,
      "C-03: and the suspended account cannot log back in",
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
