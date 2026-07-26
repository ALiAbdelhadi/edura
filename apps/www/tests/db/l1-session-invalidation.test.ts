// L1 proof — a password reset must invalidate JWT sessions issued BEFORE it,
// while a fresh login keeps working and unrelated sessions are untouched.
//
// Drives the REAL www NextAuth pipeline end-to-end against the live DB:
//   - the credentials provider's authorize() (mints the session user),
//   - the jwt() + session() callbacks (stamp `ver` at login, revalidate the
//     token's `ver` against users.token_version on every request),
//   - the real resetPassword() service (bumps token_version in-tx).
// No mocks — the only thing simulated is "a later request carrying an earlier
// token", which is exactly what the jwt callback re-checks.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth/options";
import { resetPassword } from "@/lib/services/auth/password-reset";
import { generateOpaqueToken, hashToken } from "@/lib/utils/random";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

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

// Real credentials-provider authorize() — returns the NextAuth `user` or null.
// NB: `provider.authorize` at top level is a NextAuth normalization wrapper;
// the un-mangled user function is `provider.options.authorize`.
const credProvider = (
  authOptions.providers[0] as unknown as {
    options: { authorize: (c: unknown, r: unknown) => Promise<Record<string, unknown> | null> };
  }
).options;
const login = (email: string, password: string) =>
  credProvider.authorize(
    { email, password },
    { headers: { "x-forwarded-for": "203.0.113.9" } },
  );

// Mint the JWT the same way NextAuth does at sign-in (jwt callback with `user`).
async function mint(user: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (await authOptions.callbacks!.jwt!({ token: {}, user } as never)) as Record<
    string,
    unknown
  >;
}

// Simulate a later request carrying `storedToken`: run the jwt revalidation +
// session callbacks and return the effective session user id (null = logged out).
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

    // 1) Login A + B (before any reset).
    const authA = await login(emailA, OLD_PW);
    const authB = await login(emailB, OLD_PW);
    assert(authA?.id === userA, "login A succeeds with old password");
    assert(
      (authA?.tokenVersion as number) === 0 && (authB?.tokenVersion as number) === 0,
      "issued users carry token_version 0",
    );

    const tokenA = await mint(authA!); // the attacker's / owner's pre-reset token
    const tokenB = await mint(authB!); // an unrelated normal session
    assert((tokenA.ver as number) === 0, "minted token A stamped ver=0");

    // 2) Both sessions are valid BEFORE the reset.
    assert((await effectiveUserId(tokenA)) === userA, "pre-reset: token A is accepted");
    assert((await effectiveUserId(tokenB)) === userB, "pre-reset: token B is accepted");

    // 3) A resets their password (real service; bumps token_version in-tx).
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

    // 4) The pre-reset token A is now REJECTED (logged out) — the core fix.
    assert(
      (await effectiveUserId(tokenA)) === null,
      "post-reset: token issued BEFORE the reset is rejected",
    );

    // 5) The unrelated session B is UNAFFECTED.
    assert(
      (await effectiveUserId(tokenB)) === userB,
      "post-reset: an unrelated session stays valid",
    );

    // 6) A fresh login with the NEW password works and its token is accepted.
    assert((await login(emailA, OLD_PW)) === null, "old password no longer logs in");
    const authA2 = await login(emailA, NEW_PW);
    assert(authA2?.id === userA, "fresh login with the new password succeeds");
    assert((authA2?.tokenVersion as number) === 1, "fresh login carries token_version 1");
    const tokenA2 = await mint(authA2!);
    assert(
      (await effectiveUserId(tokenA2)) === userA,
      "post-reset: a freshly-issued token is accepted",
    );
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
