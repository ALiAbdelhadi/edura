// C-03 proof (superadmin) — the same revocation must hold in the back-office
// app, whose sessions are separate cookies + a separate signing secret but
// share the users table and the L1 token_version epoch.
//
// Drives the REAL apps/superadmin NextAuth pipeline against the live DB:
//   - authorize() (the staff login door, STAFF_ROLES + status='active'),
//   - the jwt() + session() callbacks (the per-request gate),
//   - the REAL updateUserStatus() service — the one
//     PATCH /api/v1/admin/users/[id]/permissions calls.
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import { authOptions } from "@/lib/auth/options";
import { updateUserStatus } from "@/lib/services/admin/platform";

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

const credProvider = (
  authOptions.providers[0] as unknown as {
    options: { authorize: (c: unknown, r: unknown) => Promise<Record<string, unknown> | null> };
  }
).options;
const login = (email: string, password: string) =>
  credProvider.authorize(
    { email, password },
    { headers: { "x-forwarded-for": "203.0.113.32" } },
  );

async function mint(user: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (await authOptions.callbacks!.jwt!({ token: {}, user } as never)) as Record<
    string,
    unknown
  >;
}

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

    const authAcct = await login(emailAcct, PW);
    const authCtl = await login(emailCtl, PW);
    assert(
      authAcct?.id === accountant && authCtl?.id === superAdmin,
      "staff accounts log in while active",
    );

    const tokenAcct = await mint(authAcct!);
    const tokenCtl = await mint(authCtl!);
    assert(
      (await effectiveUserId(tokenAcct)) === accountant &&
        (await effectiveUserId(tokenCtl)) === superAdmin,
      "baseline: both back-office sessions are accepted",
    );

    // --- the real admin service, exactly as the permissions endpoint calls it
    await updateUserStatus(accountant, "suspended", superAdmin);
    assert(
      (await versionOf(accountant)) === 1,
      "updateUserStatus('suspended') bumps the epoch via the shipped service path",
    );
    assert(
      (await effectiveUserId(tokenAcct)) === null,
      "the suspended accountant's VERY NEXT back-office request is rejected",
    );
    assert(
      (await login(emailAcct, PW)) === null,
      "the suspended accountant cannot log back in",
    );

    // --- the acting super_admin is untouched
    assert(
      (await effectiveUserId(tokenCtl)) === superAdmin,
      "control: the acting super_admin's session is unaffected",
    );
    assert((await versionOf(superAdmin)) === 0, "control: super_admin epoch never moved");

    // --- reversal
    await updateUserStatus(accountant, "active", superAdmin);
    assert(
      (await versionOf(accountant)) === 1,
      "reinstate: reactivation does not bump again",
    );
    const authAcct2 = await login(emailAcct, PW);
    assert(authAcct2?.id === accountant, "reinstate: the accountant logs in again cleanly");
    assert(
      (await effectiveUserId(await mint(authAcct2!))) === accountant,
      "reinstate: the fresh back-office session is accepted",
    );
    assert(
      (await effectiveUserId(tokenAcct)) === null,
      "reinstate: the pre-suspension token stays dead",
    );

    // --- the same service suspending a www role revokes THAT app's session too
    // (shared users table + shared epoch; the www-side gate is proven in
    //  apps/www/tests/db/c03-status-revocation.test.ts).
    await updateUserStatus(teacher, "suspended", superAdmin);
    assert(
      (await versionOf(teacher)) === 1,
      "cross-app: suspending a www teacher from the back office bumps their epoch",
    );

    // --- guards intact
    assert(
      (await login(emailCtl, "WrongPassword!")) === null,
      "guard intact: wrong password still fails (H5 path untouched)",
    );
    assert(
      (await effectiveUserId({ ...tokenCtl, ver: 99 })) === null,
      "guard intact: L1 epoch mismatch still rejects",
    );
    assert(
      (await effectiveUserId(tokenCtl)) === superAdmin,
      "control: still logged in at the end of the run",
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
