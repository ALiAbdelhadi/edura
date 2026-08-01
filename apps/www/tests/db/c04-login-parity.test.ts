// C-04 proof (www) — the manual REST login door and the browser login door
// must accept EXACTLY the same accounts.
//
// The original verification report: `reception@…`, `manager@…`, `accountant@…`
// (role=center_staff) got **401 with the correct password** from
// POST /api/v1/auth/login while the browser door returned 200 + a cookie,
// because the route declared its own allowlist and omitted center_staff.
//
// Post better-auth migration BOTH doors forward to ONE better-auth instance
// (src/lib/auth/auth.ts), so the old drift is structurally impossible — but
// this suite still proves it BEHAVIOURALLY. Nothing here is mocked. It drives:
//   - the REAL route handler `POST` exported by
//     src/app/api/v1/auth/login/route.ts (rate-limit wrapper, error wrapper,
//     zod parsing, better-auth sign-in, Set-Cookie forwarding included), and
//   - the REAL better-auth pipeline via helpers/auth-door (before-hooks,
//     credential verify, session-row creation with the centerId enrichment
//     hook, cookie issuance), with sessionFor() as "a later request carrying
//     the session" (the real per-request gate),
// against the live DB, and cross-checks the two.
//
// It also re-proves the hardening around this door: C2 rate limiting (typed
// RATE_LIMITED), the H5 dummy-hash timing defense (with the Ali-approved
// scoped USER_NOT_FOUND exception on the browser door), L1 revocation (now
// HARD: the users_revoke_sessions trigger deletes session rows), C-03 live
// status revocation (typed ACCOUNT_INACTIVE for a proven owner), and the
// narrow invite-token claim door.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { prisma, withPlatformContext } from "@repo/database";
import { WWW_LOGIN_ROLES, SUPERADMIN_LOGIN_ROLES } from "@repo/server-core/auth/login-policy";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { resolveCenterActorContext } from "@/lib/authz/center-actor";
import { __resetRateLimiterForTests } from "@/lib/rate-limit/token-bucket";
import { claimDoor, freshIp, sessionFor, signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

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

// ---------------------------------------------------------------- door #1: REST
// The real exported route handler. A fresh x-forwarded-for per call keeps the
// per-IP token bucket out of the way except where a limit is the thing under test.
type RestResult = {
  status: number;
  body: Record<string, never> & {
    data?: { token: string; user: { id: string; role: string; centerId?: string } };
    error?: { code: string; message: string };
  };
  cookie: string | null;
  /** Set-Cookie folded into a request `cookie` header, for sessionFor(). */
  cookieHeader: string;
};
async function restPost(body: unknown, ip = freshIp()): Promise<RestResult> {
  const res = await loginRoute(
    new Request("http://localhost:3002/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
  return {
    status: res.status,
    body: (await res.json()) as RestResult["body"],
    cookie: res.headers.get("set-cookie"),
    cookieHeader: res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0]!)
      .join("; "),
  };
}
const restLogin = (email: string, password: string, ip = freshIp()) =>
  restPost({ email, password }, ip);

// ------------------------------------------------- door #2: browser (better-auth)
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

      const rest = await restLogin(u.email, PW);
      assert(rest.status === 200, `${sub}: REST /api/v1/auth/login -> 200 (was 401)`);
      assert(rest.body.data?.user.id === u.id, `${sub}: REST returns the right user`);
      assert(rest.body.data?.user.role === "center_staff", `${sub}: REST role = center_staff`);
      assert(
        rest.body.data?.user.centerId === fx.center.id,
        `${sub}: REST resolves the staff member's center (was never resolved here)`,
      );
      assert(
        (rest.cookie ?? "").includes("edura.session_token="),
        `${sub}: REST sets the better-auth session cookie`,
      );

      const na = await signInDoor(u.email, PW);
      assert(na.ok && (na.user.id as string) === u.id, `${sub}: browser door -> the same user`);

      // PARITY, end to end: the session each door minted is accepted by the
      // very same per-request gate every www route sits behind.
      const restSession = await sessionFor(rest.cookieHeader);
      assert(
        restSession?.userId === u.id,
        `${sub}: the REST-issued session authenticates subsequent requests (real parity)`,
      );
      const naSession = na.ok ? await sessionFor(na.cookie) : null;
      assert(naSession?.userId === u.id, `${sub}: the browser-door session does too`);
      assert(
        restSession?.role === naSession?.role &&
          restSession?.centerId === naSession?.centerId &&
          restSession?.centerId === fx.center.id,
        `${sub}: both doors mint an IDENTICAL session claim set (role/centerId)`,
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
      const rest = await restLogin(u.email, PW);
      const na = await signInDoor(u.email, PW);
      assert(
        rest.status === 200 &&
          rest.body.data?.user.id === u.id &&
          na.ok &&
          (na.user.id as string) === u.id,
        `${label}: 200 on REST and accepted by the browser door (no regression)`,
      );
    }
    const ownerRest = await restLogin(owner.email, PW);
    assert(
      ownerRest.body.data?.user.centerId === fx.center.id,
      "center_admin: REST still resolves the center from the admin profile",
    );

    // =================================== 3) back-office roles rejected on www
    console.log("\n3) super_admin + accountant are still refused by BOTH www doors");
    __resetRateLimiterForTests();
    for (const [label, u] of [
      ["super_admin", superAdmin],
      ["accountant", platformAccountant],
    ] as const) {
      const rest = await restLogin(u.email, PW);
      assert(
        rest.status === 401 && rest.body.error?.code === "unauthenticated",
        `${label}: REST /api/v1/auth/login -> 401`,
      );
      assert(
        rest.cookie === null,
        `${label}: REST sets NO session cookie (no www session can be minted)`,
      );
      const na = await signInDoor(u.email, PW);
      assert(!na.ok && na.status === 401, `${label}: browser door -> refused (401)`);
      assert(
        rest.body.error?.message === "Invalid email or password" &&
          !na.ok &&
          na.message === "Invalid email or password",
        `${label}: the refusal is generic on BOTH doors (no "wrong app" oracle)`,
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
      const restOk = (await restLogin(u.email, PW)).status === 200;
      const naOk = (await signInDoor(u.email, PW)).ok;
      const expected = WWW_LOGIN_ROLES.has(role as never);
      if (restOk !== naOk || restOk !== expected) {
        disagreements++;
        console.error(`    role=${role} rest=${restOk} browser=${naOk} expected=${expected}`);
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
    const t0 = Date.now();
    const unknown = await restLogin(`${tag}-nobody@x.io`, PW);
    const tUnknown = Date.now() - t0;
    const t1 = Date.now();
    const wrongPw = await restLogin(staff.manager!.email, "WrongPassword!");
    const tWrong = Date.now() - t1;
    assert(unknown.status === 401 && wrongPw.status === 401, "H5: both failures are a plain 401");
    assert(
      unknown.body.error?.message === wrongPw.body.error?.message,
      "H5: REST message identical for unknown-email and wrong-password",
    );
    // A missing account must still pay for a hash comparison. (The structural
    // guarantee — one unconditional compare against DUMMY_HASH when ineligible
    // — lives in the before-hook in lib/auth/auth.ts; wall-clock over a network
    // DB is too noisy to compare the two directly, so this only asserts the
    // work happened at all.)
    assert(
      tUnknown > 15 && tWrong > 15,
      `H5: both the unknown-email (${tUnknown}ms) and wrong-password (${tWrong}ms) paths ran bcrypt`,
    );
    const doorUnknown = await signInDoor(`${tag}-nobody@x.io`, PW);
    assert(
      !doorUnknown.ok && doorUnknown.message === "USER_NOT_FOUND",
      "H5 (scoped exception): the browser door types USER_NOT_FOUND for a truly unknown email",
    );
    const doorWrong = await signInDoor(staff.manager!.email, "WrongPassword!");
    assert(
      !doorWrong.ok && doorWrong.message === "Invalid email or password",
      "H5: a wrong password on an EXISTING account stays generic on the browser door",
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

    // --- C2: rate limiting on both doors.
    // The REST bucket is per pathname+IP (capacity 10, refill 30/min). Burst it
    // with malformed bodies: withRateLimit runs BEFORE the handler, so those
    // requests still consume tokens while returning fast enough that refill
    // cannot mask the limit.
    const burstIp = "203.0.113.204";
    let restLimitedAt = -1;
    for (let i = 0; i < 20; i++) {
      const r = await restPost({ email: "not-an-email" }, burstIp);
      if (r.status === 429 && r.body.error?.code === "rate_limited") {
        restLimitedAt = i + 1;
        break;
      }
    }
    assert(
      restLimitedAt > 0,
      `C2: the REST door 429s a per-IP burst at request #${restLimitedAt} (withRateLimit intact)`,
    );
    // The decisive property: once that IP is throttled, even a CORRECT
    // credential is refused — the throttle sits in front of the password check.
    const throttledButValid = await restLogin(teacher.email, PW, burstIp);
    assert(
      throttledButValid.status === 429 && throttledButValid.cookie === null,
      "C2: a throttled IP is refused even with the RIGHT password, and gets no cookie",
    );
    assert(
      (await restLogin(teacher.email, PW, "203.0.113.77")).status === 200,
      "C2: an unrelated IP is unaffected (the bucket is per-IP, not global)",
    );

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
    const l1Fresh = await restLogin(student.email, PW);
    assert(l1Fresh.status === 200, "L1: the REST door re-admits the user after the bump");
    assert(
      (await sessionFor(l1Fresh.cookieHeader))?.userId === student.id,
      "L1: the re-issued REST session is accepted again (parity on revocation too)",
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
    const suspendedRest = await restLogin(revoked.email, PW);
    assert(
      suspendedRest.status === 401,
      "C-03: the suspended staff member cannot log back in via REST (generic 401)",
    );
    const suspendedDoor = await signInDoor(revoked.email, PW);
    assert(!suspendedDoor.ok, "C-03: nor via the browser door (status gate on BOTH doors)");
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

    // A shell (passwordless) account must not be admitted by either password
    // door even though its role is on the www allowlist.
    const shell = await mk("shell", "student", false);
    await admin.query(`UPDATE users SET status = 'shell' WHERE id = $1`, [shell.id]);
    assert(
      (await restLogin(shell.email, PW)).status === 401 &&
        !(await signInDoor(shell.email, PW)).ok,
      "guard intact: a passwordless shell account is refused by both password doors",
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
