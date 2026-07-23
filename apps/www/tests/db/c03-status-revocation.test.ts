// C-03 proof (www) — suspending or blacklisting a user must revoke their LIVE
// session, not merely block the next login.
//
// The verification report showed: suspend a teacher → GET /me still 200 →
// POST /grades still 201, for up to the full 30-day JWT lifetime, because
// requireRole() reads the role from the JWT and the L1 epoch was never bumped
// by a status change.
//
// This drives the REAL www NextAuth pipeline against the live DB:
//   - the credentials provider's authorize() (the login door),
//   - the jwt() + session() callbacks (the per-request gate every
//     requireSession/requireRole call sits behind),
//   - the REAL platformBlacklistUser() / removeBlacklistEntry() services,
//   - the REAL prisma write updateUserStatus() performs, so the new
//     session-revocation client extension is exercised as shipped.
// Nothing is mocked. The only thing simulated is "a later request carrying an
// earlier token" — exactly what the jwt callback re-checks.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "@repo/database";
import {
  platformBlacklistUser,
  removeBlacklistEntry,
} from "@repo/server-core/services/blacklist/blacklist";
import { authOptions } from "@/lib/auth/options";

neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

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

// Real credentials-provider authorize(). `provider.authorize` at top level is a
// NextAuth normalization wrapper; the un-mangled function is options.authorize.
const credProvider = (
  authOptions.providers[0] as unknown as {
    options: { authorize: (c: unknown, r: unknown) => Promise<Record<string, unknown> | null> };
  }
).options;
const login = (email: string, password: string) =>
  credProvider.authorize(
    { email, password },
    { headers: { "x-forwarded-for": "203.0.113.31" } },
  );

// Mint the JWT the way NextAuth does at sign-in (jwt callback WITH `user`).
async function mint(user: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (await authOptions.callbacks!.jwt!({ token: {}, user } as never)) as Record<
    string,
    unknown
  >;
}

// One later request carrying `storedToken`: run the jwt revalidation + session
// callbacks and return the effective session user id (null = logged out, which
// is what requireSession() turns into a 401 and requireRole() never reaches).
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
const statusOf = async (id: string) =>
  (await admin.query(`SELECT status FROM users WHERE id=$1`, [id])).rows[0].status as string;

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
    const authT = await login(emailT, PW);
    const authS = await login(emailS, PW);
    const authC = await login(emailC, PW);
    assert(
      authT?.id === teacher && authS?.id === student && authC?.id === control,
      "all three accounts log in while active",
    );

    const tokenT = await mint(authT!);
    const tokenS = await mint(authS!);
    const tokenC = await mint(authC!);

    assert(
      (await effectiveUserId(tokenT)) === teacher &&
        (await effectiveUserId(tokenS)) === student &&
        (await effectiveUserId(tokenC)) === control,
      "baseline: every live session is accepted before any status change",
    );

    // -------------------------------------------------- 1) SUSPEND a teacher
    // The exact write updateUserStatus() performs, through the shipped client
    // (so the session-revocation extension is what does the bump).
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
      (await effectiveUserId(tokenT)) === null,
      "suspend: the VERY NEXT request on the pre-suspension token is rejected",
    );
    assert(
      (await login(emailT, PW)) === null,
      "suspend: the suspended account cannot log back in either",
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
      (await effectiveUserId(tokenS)) === null,
      "blacklist: the VERY NEXT request on the pre-blacklist token is rejected",
    );

    // ------------------------------------------------- 3) CONTROL untouched
    assert(
      (await effectiveUserId(tokenC)) === control,
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
    const authT2 = await login(emailT, PW);
    assert(authT2?.id === teacher, "reinstate: the teacher can log in again cleanly");
    assert(
      (authT2?.tokenVersion as number) === verAfterUnsuspend,
      "reinstate: the fresh login carries the CURRENT epoch",
    );
    const tokenT2 = await mint(authT2!);
    assert(
      (await effectiveUserId(tokenT2)) === teacher,
      "reinstate: the freshly-issued session is accepted on subsequent requests",
    );
    assert(
      (await effectiveUserId(tokenT)) === null,
      "reinstate: the OLD pre-suspension token stays dead (revocation is not undone)",
    );

    // Lift the blacklist via the real service (super_admin actor).
    await removeBlacklistEntry(entry.id, {
      id: adminId,
      role: "super_admin",
      email: emailA,
      name: emailA,
    } as never);
    assert((await statusOf(student)) === "active", "lift blacklist: status back to 'active'");
    const authS2 = await login(emailS, PW);
    assert(authS2?.id === student, "lift blacklist: the student can log in again cleanly");
    assert(
      (await effectiveUserId(await mint(authS2!))) === student,
      "lift blacklist: the new session is accepted",
    );

    // ------------------------- 5) CASCADE path (updateMany) is covered too
    // rejectCenter / blacklistCenter / toggleCenter suspend a center's admins
    // with updateMany — the extension must bump every matched row.
    const cascadeA = await mk(`${tag}-ca@x.io`, "center_admin");
    const cascadeB = await mk(`${tag}-cb@x.io`, "center_admin");
    cleanupUsers.push(cascadeA, cascadeB);
    const cascadeToken = await mint((await login(`${tag}-ca@x.io`, PW))!);
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
      (await effectiveUserId(cascadeToken)) === null,
      "cascade: a center-admin session dies on the next request too",
    );

    // ---------------------------------- 6) soft-delete revokes as well
    const doomed = await mk(`${tag}-del@x.io`, "student");
    cleanupUsers.push(doomed);
    const doomedToken = await mint((await login(`${tag}-del@x.io`, PW))!);
    await withPlatformContext((tx) =>
      tx.user.updateMany({
        where: { id: doomed },
        data: { status: "deleted", deletedAt: new Date() },
      }),
    );
    assert(
      (await effectiveUserId(doomedToken)) === null,
      "soft-delete: the deleted user's live session is rejected on the next request",
    );

    // -------------------- 7) existing guards are still intact (no weakening)
    assert(
      (await login(emailC, "WrongPassword!")) === null,
      "guard intact: a wrong password still fails (H5 path untouched)",
    );
    assert(
      (await login(`${tag}-nobody@x.io`, PW)) === null,
      "guard intact: an unknown email still fails",
    );
    assert(
      (await effectiveUserId({ ...tokenC, ver: (tokenC.ver as number) + 5 })) === null,
      "guard intact: L1 epoch mismatch still rejects (token_version check preserved)",
    );
    assert(
      (await effectiveUserId(tokenC)) === control,
      "control: still logged in at the end of the run",
    );
  } finally {
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
