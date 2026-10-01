import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { registerWalkIn, resendWalkIn } from "@repo/server-core/services/walk-in/walk-in";
import { maskName } from "@repo/server-core/services/students/disclosure";
import type { SessionUser } from "@repo/server-core/erp-auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "wio-" + Math.floor(Math.random() * 1e9).toString(36);
const seed = Math.floor(Math.random() * 1e9);
// 01[0125] + 8 digits, the only shape normalizeEgyptPhone accepts. Rows are stored
// in the +20 form the service normalizes to; typedPhone is what a receptionist enters.
const typedPhone = (i: number) => `010${String(seed).padStart(9, "0").slice(0, 6)}${String(i).padStart(2, "0")}`;
const phoneOf = (i: number) => `+2${typedPhone(i)}`;

const actorFor = (centerId: string, userId: string) =>
  ({ id: userId, role: "center_admin", centerId, locale: "en" }) as SessionUser;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await admin.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    c.release();
  }
}

async function refusal(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "<<SUCCEEDED>>";
  } catch (e) {
    return (e as Error).message ?? "";
  }
}

const countInvites = async (userId: string) =>
  Number((await q<{ n: string }>(`SELECT count(*) n FROM invite_tokens WHERE user_id = $1`, [userId]))[0]!.n);
const countWhatsApp = async (userId: string) =>
  Number((await q<{ n: string }>(`SELECT count(*) n FROM whatsapp_messages WHERE user_id = $1`, [userId]))[0]!.n);
const rosterRows = async (centerId: string, studentId: string) =>
  Number((await q<{ n: string }>(
    `SELECT count(*) n FROM center_student_rosters WHERE center_id = $1 AND student_id = $2`,
    [centerId, studentId],
  ))[0]!.n);

async function main() {
  console.log("Walk-in roster ownership (H1/H2) —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const centerA = await tx.center.create({
      data: { name: tag + "-A", shortId: (tag + "A").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
    });
    const centerB = await tx.center.create({
      data: { name: tag + "-B", shortId: (tag + "B").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, isDemo: true },
    });
    const adminA = await tx.user.create({
      data: { name: tag + "-adminA", role: "center_admin", email: tag + "-a@x.io", status: "active", isDemo: true },
    });
    const adminB = await tx.user.create({
      data: { name: tag + "-adminB", role: "center_admin", email: tag + "-b@x.io", status: "active", isDemo: true },
    });

    // an unclaimed walk-in (passwordHash null) on A's roster: the takeover vector
    const shell = await tx.user.create({
      data: { name: tag + "-shell-one", phone: phoneOf(1), role: "student", status: "shell", passwordHash: null, isDemo: true },
    });
    await tx.studentProfile.create({
      data: { userId: shell.id, fullName: tag + "-shell-one", phone: phoneOf(1), entityType: "invited", inviteCode: (tag + "I1").toUpperCase(), familyLinkCode: (tag + "F1").toUpperCase() },
    });
    await tx.centerStudentRoster.create({ data: { centerId: centerA.id, studentId: shell.id } });

    // an active student on A's roster
    const active = await tx.user.create({
      data: { name: tag + "-active-two", phone: phoneOf(2), role: "student", status: "active", isDemo: true },
    });
    await tx.studentProfile.create({
      data: { userId: active.id, fullName: tag + "-active-two", phone: phoneOf(2), entityType: "invited", inviteCode: (tag + "I2").toUpperCase(), familyLinkCode: (tag + "F2").toUpperCase() },
    });
    await tx.centerStudentRoster.create({ data: { centerId: centerA.id, studentId: active.id } });

    // on A's roster but departed: leftAt must not count as ownership
    const departed = await tx.user.create({
      data: { name: tag + "-left-three", phone: phoneOf(3), role: "student", status: "shell", passwordHash: null, isDemo: true },
    });
    await tx.studentProfile.create({
      data: { userId: departed.id, fullName: tag + "-left-three", phone: phoneOf(3), entityType: "invited", inviteCode: (tag + "I3").toUpperCase(), familyLinkCode: (tag + "F3").toUpperCase() },
    });
    await tx.centerStudentRoster.create({
      data: { centerId: centerA.id, studentId: departed.id, leftAt: new Date() },
    });

    return { centerA: centerA.id, centerB: centerB.id, adminA: adminA.id, adminB: adminB.id, shell: shell.id, active: active.id, departed: departed.id };
  });

  // A student code is shape-checked in the database (8 chars, last one a computed
  // check character), so the fixture asks the database to mint them.
  const codeOf = async (userId: string, n: number): Promise<string> => {
    const seven = (String(seed).slice(0, 6) + String(n)).padStart(7, "0").slice(0, 7);
    const rows = await q<{ student_code: string }>(
      `UPDATE student_profiles SET student_code = $1 || student_code_check_char($1)
         WHERE user_id = $2 RETURNING student_code`,
      [seven, userId],
    );
    return rows[0]!.student_code;
  };
  const activeCode = await codeOf(fx.active, 2);
  await codeOf(fx.shell, 1);

  const A = actorFor(fx.centerA, fx.adminA);
  const B = actorFor(fx.centerB, fx.adminB);
  const created: string[] = [];

  try {
    console.log("\n[H1] resend for a student the caller's centre does not own");
    const invitesBefore = await countInvites(fx.shell);
    const foreign = await refusal(() => resendWalkIn(fx.shell, B));
    ok(/Student not found/.test(foreign), `centre B is refused (got: ${foreign.slice(0, 50)})`);
    ok((await countInvites(fx.shell)) === invitesBefore, "the refused resend minted NO claim token");
    ok((await countWhatsApp(fx.shell)) === 0, "the refused resend sent NO WhatsApp");

    const unknown = await refusal(() => resendWalkIn("00000000-0000-4000-8000-000000000000", B));
    ok(unknown === foreign, "an unknown id and a foreign id are indistinguishable (no enumeration oracle)");

    console.log("\n[H1] the owning centre still works, and leftAt is not ownership");
    const mine = await resendWalkIn(fx.shell, A);
    ok(!!mine.invite.claimLink, "centre A gets a claim link for its own unclaimed student");
    ok(mine.onOurRoster === true, "result is flagged on-roster");
    ok((await countInvites(fx.shell)) === invitesBefore + 1, "exactly one token minted, by the owner");

    const left = await refusal(() => resendWalkIn(fx.departed, A));
    ok(/Student not found/.test(left), `a departed roster row (leftAt set) is refused (got: ${left.slice(0, 40)})`);

    console.log("\n[H2] registering a walk-in whose phone belongs to another centre's student");
    const waBefore = await countWhatsApp(fx.active);
    const res = await registerWalkIn({ fullName: tag + "-typed-name", phone: typedPhone(2) }, B);
    ok(res.existing === true, "the existing student is still recognised (no duplicate account)");
    ok(res.onOurRoster === false, "result reports the student is not on the caller's roster");
    ok(res.studentCode === null, "the student code is withheld");
    ok(res.fullName === maskName(tag + "-active-two"), `the name is masked (got: ${res.fullName})`);
    ok(res.fullName !== tag + "-active-two", "the unmasked name is not disclosed");
    ok(await rosterRows(fx.centerB, fx.active) === 0, "the student was NOT attached to centre B's roster");
    ok((await countWhatsApp(fx.active)) === waBefore, "no WhatsApp was sent to the foreign student");

    console.log("\n[H2] the owning centre keeps the full result");
    const own = await registerWalkIn({ fullName: tag + "-typed-name", phone: typedPhone(2) }, A);
    ok(own.onOurRoster === true, "centre A is flagged on-roster");
    ok(own.fullName === tag + "-active-two", "centre A sees the unmasked name");
    ok(own.studentCode === activeCode, `centre A sees the student code (${own.studentCode})`);

    console.log("\n[regression] a genuinely new walk-in still onboards end to end");
    const fresh = await registerWalkIn({ fullName: tag + "-brand-new", phone: typedPhone(9) }, A);
    created.push(fresh.studentId);
    ok(fresh.existing === false, "a new phone creates a new shell");
    ok(!!fresh.invite.claimLink, "the new shell gets a claim link");
    ok(await rosterRows(fx.centerA, fresh.studentId) === 1, "the new shell lands on the creating centre's roster");
  } finally {
    const c = await admin.connect();
    try {
      const strays = await c.query(`SELECT id FROM users WHERE name LIKE $1`, [tag + "%"]);
      const allUsers = [
        ...new Set([fx.adminA, fx.adminB, fx.shell, fx.active, fx.departed, ...created,
          ...strays.rows.map((r: { id: string }) => r.id)]),
      ];
      const profiles = await c.query(`SELECT id FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      const profileIds = profiles.rows.map((r: { id: string }) => r.id);
      await c.query(`DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[])`, [profileIds]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM whatsapp_messages WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM invite_tokens WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM center_student_rosters WHERE student_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
      const left = await c.query(`SELECT count(*)::int n FROM users WHERE name LIKE $1`, [tag + "%"]);
      ok(left.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite walk-in-ownership.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
