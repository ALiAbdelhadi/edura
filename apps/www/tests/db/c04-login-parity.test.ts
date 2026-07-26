// C-04 proof (www) — the manual REST login door and the NextAuth door must
// accept EXACTLY the same accounts.
//
// The verification report: `reception@…`, `manager@…`, `accountant@…`
// (role=center_staff) got **401 with the correct password** from
// POST /api/v1/auth/login while NextAuth returned 200 + a cookie, because the
// route declared its own allowlist and omitted center_staff.
//
// Nothing here is mocked. This drives:
//   - the REAL route handler `POST` exported by
//     src/app/api/v1/auth/login/route.ts (rate-limit wrapper, error wrapper,
//     zod parsing, bcrypt, JWT encode and Set-Cookie all included), and
//   - the REAL NextAuth credentials `authorize()` + jwt()/session() callbacks,
// against the live DB, and cross-checks the two.
//
// It also re-proves that hardening the C-04 edit touched is intact: C2 rate
// limiting, the H5 dummy-hash timing defense, L1 token_version revocation,
// C-03 live status revocation, and the narrow walk-in token provider.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { decode } from "next-auth/jwt";
import { prisma, withPlatformContext } from "@repo/database";
import { WWW_LOGIN_ROLES, SUPERADMIN_LOGIN_ROLES } from "@repo/server-core/auth/login-policy";
import { authOptions } from "@/lib/auth/options";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { resolveCenterActorContext } from "@/lib/authz/center-actor";

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
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}
type RestResult = {
  status: number;
  body: Record<string, never> & {
    data?: { token: string; user: { id: string; role: string; centerId?: string } };
    error?: { code: string; message: string };
  };
  cookie: string | null;
};
async function restPost(body: unknown, ip = nextIp()): Promise<RestResult> {
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
  };
}
const restLogin = (email: string, password: string, ip = nextIp()) =>
  restPost({ email, password }, ip);

// ------------------------------------------------------------ door #2: NextAuth
// `provider.authorize` at top level is a NextAuth normalization wrapper; the
// un-mangled function is options.authorize (same accessor the C-03 proof uses).
const credProvider = (
  authOptions.providers[0] as unknown as {
    options: { authorize: (c: unknown, r: unknown) => Promise<Record<string, unknown> | null> };
  }
).options;
const walkinProvider = (
  authOptions.providers[1] as unknown as {
    options: { authorize: (c: unknown, r: unknown) => Promise<Record<string, unknown> | null> };
  }
).options;

const nextAuthLogin = (email: string, password: string, ip = nextIp()) =>
  credProvider.authorize({ email, password }, { headers: { "x-forwarded-for": ip } });

const mint = async (user: Record<string, unknown>) =>
  (await authOptions.callbacks!.jwt!({ token: {}, user } as never)) as Record<string, unknown>;

/** One later request carrying `token`: null = logged out. */
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

const versionOf = async (id: string) =>
  (await admin.query(`SELECT token_version FROM users WHERE id=$1`, [id])).rows[0]
    .token_version as number;

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
        (rest.cookie ?? "").includes("next-auth.session-token="),
        `${sub}: REST sets the session cookie`,
      );

      const na = await nextAuthLogin(u.email, PW);
      assert(na?.id === u.id, `${sub}: NextAuth authorize() -> the same user`);
      assert(na?.centerId === fx.center.id, `${sub}: NextAuth resolves the same centerId`);

      // PARITY, end to end: the JWT the REST door minted is accepted by the very
      // same per-request gate every www route sits behind.
      const restToken = (await decode({
        token: rest.body.data!.token,
        secret: process.env.NEXTAUTH_SECRET!,
      })) as Record<string, unknown>;
      assert(
        (await effectiveUserId(restToken)) === u.id,
        `${sub}: the REST-issued token authenticates subsequent requests (real parity)`,
      );
      assert(
        (await effectiveUserId(await mint(na!))) === u.id,
        `${sub}: the NextAuth-issued token does too`,
      );
      assert(
        restToken.role === (na!.role as string) &&
          restToken.centerId === (na!.centerId as string) &&
          restToken.ver === (na!.tokenVersion as number),
        `${sub}: both doors mint an IDENTICAL claim set (role/centerId/ver)`,
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
    for (const [label, u] of [
      ["center_admin", owner],
      ["teacher", teacher],
      ["student", student],
      ["parent", parent],
      ["assistant", assistant],
    ] as const) {
      const rest = await restLogin(u.email, PW);
      const na = await nextAuthLogin(u.email, PW);
      assert(
        rest.status === 200 && rest.body.data?.user.id === u.id && na?.id === u.id,
        `${label}: 200 on REST and accepted by NextAuth (no regression)`,
      );
    }
    const ownerRest = await restLogin(owner.email, PW);
    assert(
      ownerRest.body.data?.user.centerId === fx.center.id,
      "center_admin: REST still resolves the center from the admin profile",
    );

    // =================================== 3) back-office roles rejected on www
    console.log("\n3) super_admin + accountant are still refused by BOTH www doors");
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
      assert((await nextAuthLogin(u.email, PW)) === null, `${label}: NextAuth authorize() -> null`);
      assert(
        rest.body.error?.message === "Invalid email or password",
        `${label}: the refusal is generic (no "wrong app" oracle)`,
      );
    }

    // ============================================ 4) the allowlists are one list
    console.log("\n4) the two doors read ONE list");
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
      const naOk = (await nextAuthLogin(u.email, PW)) !== null;
      const expected = WWW_LOGIN_ROLES.has(role as never);
      if (restOk !== naOk || restOk !== expected) {
        disagreements++;
        console.error(`    role=${role} rest=${restOk} nextauth=${naOk} expected=${expected}`);
      }
    }
    assert(
      disagreements === 0,
      "all 8 roles: REST verdict === NextAuth verdict === the shared policy",
    );

    // ================================================= 5) hardening regressions
    console.log("\n5) auth hardening intact");

    // --- H5: bcrypt runs on EVERY path (no timing/enumeration oracle).
    const t0 = Date.now();
    const unknown = await restLogin(`${tag}-nobody@x.io`, PW);
    const tUnknown = Date.now() - t0;
    const t1 = Date.now();
    const wrongPw = await restLogin(staff.manager!.email, "WrongPassword!");
    const tWrong = Date.now() - t1;
    assert(unknown.status === 401 && wrongPw.status === 401, "H5: both failures are a plain 401");
    assert(
      unknown.body.error?.message === wrongPw.body.error?.message,
      "H5: identical message for unknown-email and wrong-password",
    );
    // A missing account must still pay for a hash comparison. (The structural
    // guarantee — one unconditional bcrypt.compare against DUMMY_HASH when
    // ineligible — is asserted at source level in tests/unit/c04-login-allowlist;
    // wall-clock over a network DB is too noisy to compare the two directly, so
    // this only asserts the work happened at all.)
    assert(
      tUnknown > 15 && tWrong > 15,
      `H5: both the unknown-email (${tUnknown}ms) and wrong-password (${tWrong}ms) paths ran bcrypt`,
    );
    assert(
      (await nextAuthLogin(`${tag}-nobody@x.io`, PW)) === null &&
        (await nextAuthLogin(staff.manager!.email, "WrongPassword!")) === null,
      "H5: NextAuth door likewise refuses both without distinguishing",
    );
    // The ineligible-role path must ALSO compare a hash (a back-office account
    // must not answer faster than a wrong password on www).
    const t2 = Date.now();
    await restLogin(superAdmin.email, PW);
    assert(Date.now() - t2 > 15, "H5: the ineligible-role path runs bcrypt too (no fast reject)");

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
    // Per-EMAIL bucket: cap 5. Vary the IP so this is unambiguously the email
    // bucket doing the throttling, then confirm the CORRECT password is refused
    // too (a throttled account is locked, not just wrong-password-rejected).
    for (let i = 0; i < 6; i++) await nextAuthLogin(rlEmail2, "nope");
    const throttled = await nextAuthLogin(rlEmail2, PW);
    assert(throttled === null, "C2: NextAuth per-email bucket keeps refusing after the burst");
    const freshStillWorks = await nextAuthLogin(teacher.email, PW);
    assert(
      freshStillWorks?.id === teacher.id,
      "C2: an unrelated account is unaffected (the bucket is per-email, not global)",
    );

    // --- L1: token_version revocation.
    const l1 = await nextAuthLogin(student.email, PW);
    const l1Token = await mint(l1!);
    assert((await effectiveUserId(l1Token)) === student.id, "L1: baseline session accepted");
    await admin.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [
      student.id,
    ]);
    assert(
      (await effectiveUserId(l1Token)) === null,
      "L1: a bumped token_version rejects the pre-existing token on the NEXT request",
    );
    const l1Fresh = await restLogin(student.email, PW);
    const l1FreshToken = (await decode({
      token: l1Fresh.body.data!.token,
      secret: process.env.NEXTAUTH_SECRET!,
    })) as Record<string, unknown>;
    assert(
      l1FreshToken.ver === (await versionOf(student.id)),
      "L1: the REST door stamps the CURRENT epoch (parity on the L1 claim too)",
    );
    assert(
      (await effectiveUserId(l1FreshToken)) === l1Fresh.body.data!.user.id,
      "L1: the re-issued REST session is accepted again",
    );

    // --- C-03: live status revocation, on the center_staff path specifically.
    const revoked = staff.receptionist!;
    const revokedToken = await mint((await nextAuthLogin(revoked.email, PW))!);
    assert(
      (await effectiveUserId(revokedToken)) === revoked.id,
      "C-03: baseline — the staff session is live",
    );
    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: revoked.id }, data: { status: "suspended" } }),
    );
    assert(
      (await effectiveUserId(revokedToken)) === null,
      "C-03: suspending the staff member kills the live session on the next request",
    );
    const suspendedRest = await restLogin(revoked.email, PW);
    assert(
      suspendedRest.status === 401,
      "C-03: the suspended staff member cannot log back in via REST either",
    );
    assert(
      (await nextAuthLogin(revoked.email, PW)) === null,
      "C-03: nor via NextAuth (status gate survives on BOTH doors)",
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
        (await nextAuthLogin(shell.email, PW)) === null,
      "guard intact: a passwordless shell account is refused by both password doors",
    );

    // --- Step 7: the narrow walk-in token provider still works and stays narrow.
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
    const claimed = await walkinProvider.authorize(
      { token: rawToken },
      { headers: { "x-forwarded-for": nextIp() } },
    );
    assert(claimed?.id === shell.id, "walk-in: a valid token still claims the shell student");
    assert(
      (await walkinProvider.authorize(
        { token: rawToken },
        { headers: { "x-forwarded-for": nextIp() } },
      )) === null,
      "walk-in: the token is single-use (second claim refused)",
    );
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
      (await walkinProvider.authorize(
        { token: staffToken },
        { headers: { "x-forwarded-for": nextIp() } },
      )) === null,
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
