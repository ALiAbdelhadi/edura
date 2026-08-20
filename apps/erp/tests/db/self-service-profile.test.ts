// SELF-SERVICE PROFILE CORRECTION — proof that a person can fix their own data,
// and that the fix does not open anything the product had closed.
//
// The feature is one sentence: the login email, the guardian's contact details
// and the wizard's academic answers stop being write-once. Everything below is
// about the second half of that sentence — the four rules that make widening a
// write surface safe, each asserted against real rows through the real routes:
//
//   1. A CREDENTIALED ACCOUNT RE-PROVES ITS PASSWORD. The login email is the
//      recovery address; a borrowed unlocked phone must not redirect it. A
//      wrong password is a 400, not a 401 — a typo must not read as a dead
//      session and sign the user out.
//   2. AN ACCOUNT WITH NO PASSWORD IS EXEMPT, and is still able to correct the
//      address. That is the walk-in student this feature exists for.
//   3. THE GUARDIAN ADDRESS STAYS A DIFFERENT ADULT'S. `setGuardianContact`
//      already refused a guardian email equal to the student's own. The email
//      route now refuses the mirror image, so a minor cannot satisfy the
//      child-safety gate by editing the OTHER side of the comparison.
//   4. THE NEW ADDRESS IS UNPROVEN AND THE CHANGE IS ON THE RECORD —
//      `email_verified` false, one audit row naming the actor.
//
// Plus the two corrections that came with it: a name edit reaches the column
// global search actually filters on, and saving a guardian PHONE beside an
// email already on file does not start an escalation clock for a requirement
// the family has already met.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma, withPlatformContext } from "@repo/database";
import bcrypt from "bcryptjs";
import { POST as emailRoute } from "@/app/api/v1/me/email/route";
import { PATCH as meRoute } from "@/app/api/v1/me/route";
import { setGuardianContact } from "@/lib/services/invites/guardian-contact";
import { __setSessionOverrideForTests } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

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

const PW = "CorrectHorse!7";

/** A fresh IP per call: the routes are rate-limited per path+IP. */
let ipN = 0;
const freshIp = () => `203.0.113.${(ipN++ % 250) + 1}`;

type Reply = { status: number; body: any };

async function callRoute(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
  path: string,
  method: "POST" | "PATCH",
  actor: { id: string; role: string; email: string | null },
  body: Record<string, unknown>,
): Promise<Reply> {
  // The ONLY thing stubbed is the cookie -> session read at the very edge.
  // requireSession, the rate-limit wrapper, the error wrapper, zod, bcrypt and
  // every DB write below it are the real code path.
  __setSessionOverrideForTests(
    () => ({ id: actor.id, role: actor.role, email: actor.email, name: "T", locale: "ar" }) as SessionUser,
  );
  try {
    const res = await handler(
      new Request(`http://localhost:3002${path}`, {
        method,
        headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({}) },
    );
    return { status: res.status, body: await res.json() };
  } finally {
    __setSessionOverrideForTests(null);
  }
}

async function main() {
  const tag = "ssp-" + Math.floor(Math.random() * 1e9).toString(36);
  const userIds: string[] = [];

  const mkUser = async (role: string, name: string, opts: { password?: boolean } = {}) => {
    const rows = await admin.query(
      `INSERT INTO users (email, role, name, status, password_hash, is_demo, created_at, updated_at)
       VALUES ($1, $2::role, $3, 'active'::user_status, $4, true, now(), now())
       RETURNING id, email`,
      [`${tag}-${name.toLowerCase().replace(/\W+/g, "")}@example.com`, role, name,
       opts.password === false ? null : await bcrypt.hash(PW, 10)],
    );
    const row = rows.rows[0] as { id: string; email: string };
    userIds.push(row.id);
    return row;
  };

  const mkStudent = async (name: string, opts: { password?: boolean } = {}) => {
    const u = await mkUser("student", name, opts);
    await admin.query(
      `INSERT INTO student_profiles (id, user_id, full_name, family_link_code, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), now())`,
      [u.id, name, (tag + u.id.slice(0, 6)).toUpperCase().slice(0, 20)],
    );
    return u;
  };

  const dbUser = (id: string) =>
    withPlatformContext((tx) =>
      tx.user.findUnique({ where: { id }, select: { email: true, emailVerified: true, name: true } }),
    );

  const actor = (u: { id: string; email: string }, role = "student") =>
    ({ id: u.id, role, email: u.email });

  const changeEmail = (u: { id: string; email: string }, body: Record<string, unknown>, role = "student") =>
    callRoute(emailRoute as never, "/api/v1/me/email", "POST", actor(u, role), body);

  const patchMe = (u: { id: string; email: string }, body: Record<string, unknown>, role = "student") =>
    callRoute(meRoute as never, "/api/v1/me", "PATCH", actor(u, role), body);

  try {
    // ---------------------------------------------------------------- 1 + 4
    console.log("\n1. A credentialed account re-proves its password");
    const alice = await mkStudent("SspAlice");

    const wrong = await changeEmail(alice, {
      email: `${tag}-alice-new@example.com`,
      currentPassword: "not-the-password",
    });
    assert(wrong.status === 400, `a wrong current password is refused with 400, not 401 (got ${wrong.status})`);
    assert(
      (await dbUser(alice.id))?.email === alice.email,
      "the refusal left the address on file unchanged",
    );

    const missing = await changeEmail(alice, { email: `${tag}-alice-new@example.com` });
    assert(missing.status === 400, `omitting the password entirely is refused (got ${missing.status})`);

    const newEmail = `${tag}-alice-new@example.com`;
    const good = await changeEmail(alice, { email: newEmail, currentPassword: PW });
    assert(good.status === 200 && good.body?.data?.changed === true, "the correct password changes the email");
    const after = await dbUser(alice.id);
    assert(after?.email === newEmail, "the new address is the one on the row");
    assert(after?.emailVerified === false, "the new address is UNVERIFIED — the flag means mail was seen to arrive");

    const audit = await admin.query(
      `SELECT before_state, after_state FROM audit_logs
        WHERE actor_id = $1 AND action = 'user.email_changed'`,
      [alice.id],
    );
    assert(audit.rows.length === 1, `exactly one audit row names the change (got ${audit.rows.length})`);
    assert(
      (audit.rows[0] as any)?.after_state?.email === newEmail,
      "the audit row records the address it moved to",
    );

    const noop = await changeEmail(alice, { email: newEmail, currentPassword: PW });
    assert(
      noop.status === 200 && noop.body?.data?.changed === false,
      "re-saving the same address is a no-op, not a second audit row",
    );
    const auditAgain = await admin.query(
      `SELECT id FROM audit_logs WHERE actor_id = $1 AND action = 'user.email_changed'`,
      [alice.id],
    );
    assert(auditAgain.rows.length === 1, "…and the audit trail still holds exactly one row");

    // -------------------------------------------------------------------- 2
    console.log("\n2. An account with no password can still correct its address");
    const walkin = await mkStudent("SspWalkin", { password: false });
    const claimed = await changeEmail(walkin, { email: `${tag}-walkin-fixed@example.com` });
    assert(
      claimed.status === 200 && claimed.body?.data?.changed === true,
      "a walk-in with no credentials is not asked to prove one it does not have",
    );

    // -------------------------------------------------------------------- 3
    console.log("\n3. The guardian address stays a different adult's");
    const bob = await mkStudent("SspBob");
    const guardian = `${tag}-guardian@example.com`;
    await setGuardianContact(
      { id: bob.id, role: "student", email: bob.email } as SessionUser,
      bob.id,
      { guardianEmail: guardian },
    );

    const collide = await changeEmail(bob, { email: guardian, currentPassword: PW });
    assert(
      collide.status >= 400,
      `a student cannot move their login email ONTO their guardian's (got ${collide.status})`,
    );
    assert((await dbUser(bob.id))?.email === bob.email, "…and the row is unchanged");

    // The other direction was already closed; asserted here so the pair is
    // visibly one rule rather than two that could drift apart.
    let reverseRefused = false;
    try {
      await setGuardianContact(
        { id: bob.id, role: "student", email: bob.email } as SessionUser,
        bob.id,
        { guardianEmail: bob.email },
      );
    } catch {
      reverseRefused = true;
    }
    assert(reverseRefused, "and the guardian email cannot be moved onto the student's own");

    console.log("\n4. An address in use elsewhere is refused with a sentence, not a constraint");
    // Alice's CURRENT address, not the one she vacated — a freed address is
    // legitimately available again, and asserting against the old one would
    // have proved nothing while looking like it did.
    const taken = await changeEmail(bob, { email: newEmail, currentPassword: PW });
    assert(taken.status === 409, `a duplicate address is a 409 conflict (got ${taken.status})`);
    assert(
      /email/i.test(String(taken.body?.error?.message ?? "")),
      "…and the message names the field rather than the unique index",
    );

    // -------------------------------------------------------------------- 5
    console.log("\n5. A corrected name reaches the column the counter searches");
    const renamed = "Ssp Corrected Name";
    const patched = await patchMe(alice, { name: renamed });
    assert(patched.status === 200, "the name save succeeds");
    const profileName = await admin.query(
      `SELECT full_name FROM student_profiles WHERE user_id = $1`,
      [alice.id],
    );
    assert(
      (profileName.rows[0] as any)?.full_name === renamed,
      "student_profiles.full_name follows users.name — global search FILTERS on it",
    );
    assert((await dbUser(alice.id))?.name === renamed, "…and users.name is the same value, not a copy that drifted");

    console.log("\n6. A phone already on file is refused by name, not by index");
    const phoneOwner = await mkStudent("SspPhone");
    await admin.query(`UPDATE users SET phone = $2 WHERE id = $1`, [phoneOwner.id, "01012345678"]);
    const dupPhone = await patchMe(alice, { phone: "01012345678" });
    assert(dupPhone.status === 409, `a duplicate phone is a 409 (got ${dupPhone.status})`);
    assert(
      /phone/i.test(String(dupPhone.body?.error?.message ?? "")),
      "…and the message names the field, instead of the raw unique-constraint sentence",
    );

    // -------------------------------------------------------------------- 7
    console.log("\n7. Correcting a guardian PHONE does not start a deadline already met");
    const carol = await mkStudent("SspCarol");
    await setGuardianContact(
      { id: carol.id, role: "student", email: carol.email } as SessionUser,
      carol.id,
      { guardianEmail: `${tag}-carol-guardian@example.com` },
    );
    const beforeDue = await admin.query(
      `SELECT guardian_contact_due_at FROM student_profiles WHERE user_id = $1`, [carol.id]);
    await setGuardianContact(
      { id: carol.id, role: "student", email: carol.email } as SessionUser,
      carol.id,
      { guardianPhone: "01099887766" },
    );
    const afterDue = await admin.query(
      `SELECT guardian_contact_due_at, guardian_phone FROM student_profiles WHERE user_id = $1`, [carol.id]);
    assert(
      (afterDue.rows[0] as any)?.guardian_phone === "01099887766",
      "the corrected guardian phone is stored",
    );
    assert(
      (afterDue.rows[0] as any)?.guardian_contact_due_at == null &&
        (beforeDue.rows[0] as any)?.guardian_contact_due_at == null,
      "…and no escalation clock was started for a family that already supplied an email",
    );
  } finally {
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM auth_accounts WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// The environment guard runs BEFORE main(), so invoking this file directly
// (which bypasses the `pretest:db` step) cannot write to dev or production.
assertDbEnv(["test"], { intent: "suite self-service-profile.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
