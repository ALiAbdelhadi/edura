import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  createTeacher,
  setTeacherStatus,
  updateTeacherProfile,
} from "@repo/server-core/backoffice/admin/teacher-control";
import type { SessionUser } from "@repo/server-core/backoffice-auth/session";

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
function section(t: string) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`);
}
async function rejects(fn: () => Promise<unknown>, expect: RegExp) {
  try {
    await fn();
    return { threw: false, matched: false, message: "(resolved — no error)" };
  } catch (e) {
    const message = (e as { message?: string })?.message ?? String(e);
    return { threw: true, matched: expect.test(message), message };
  }
}
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;

async function main() {
  const tag = "tctl-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash("Passw0rd!TCTL", 10);
  const users: string[] = [];

  const mkUser = async (key: string, role: string, status = "active") => {
    const id = (
      await q(
        `INSERT INTO users (email, role, name, status, password_hash, is_demo, updated_at)
         VALUES ($1,$2,$3,$4,$5,true,now()) RETURNING id`,
        [`${tag}-${key}@edura.test`, role, `${tag}-${key}`, status, hash],
      )
    )[0].id as string;
    users.push(id);
    return id;
  };
  const auditRows = (action: string, targetId: string) =>
    q(`SELECT * FROM audit_logs WHERE action=$1 AND target_id=$2 ORDER BY created_at DESC`, [
      action,
      targetId,
    ]);

  try {
    console.log(`TEACHER CONTROL — create / update / status — ${tag}`);

    const superAdminId = await mkUser("super", "super_admin");
    const actor = { id: superAdminId, role: "super_admin" } as SessionUser;

    // ── CREATE ────────────────────────────────────────────────────────────
    section("createTeacher");

    const created = await createTeacher(actor, {
      name: `${tag} Teacher`,
      email: `${tag}-new@edura.test`,
      password: "Passw0rd!NEW",
      phone: "01012345678",
      subjects: ["math", "physics"],
      experienceYears: 7,
      qualifications: "BSc",
      attendanceMode: "counter_and_door",
    });
    users.push(created.id);

    const row = (await q(`SELECT * FROM users WHERE id=$1`, [created.id]))[0];
    assert(row.role === "teacher", "the account is created with role 'teacher'");
    assert(row.status === "active", "…active, so the admin's act IS the approval");
    assert(row.email_verified === true, "…and email-verified, like createAccountant");
    assert(
      typeof row.password_hash === "string" && row.password_hash.length > 20,
      "…with the password hashed, never stored in the clear",
    );

    const profile = (await q(`SELECT * FROM teacher_profiles WHERE user_id=$1`, [created.id]))[0];
    assert(!!profile, "the teacher_profiles row is created in the SAME transaction");
    assert(
      Array.isArray(profile.subjects) && profile.subjects.length === 2,
      "…carrying the subjects it was given",
    );
    assert(profile.experience_years === 7, "…and the years of experience");
    assert(
      profile.attendance_mode === "counter_and_door",
      "…and the attendance mode chosen at creation",
    );

    const createAudit = await auditRows("teacher.created", created.id);
    assert(createAudit.length === 1, "the creation is audited exactly once");
    assert(
      createAudit[0]?.actor_id === superAdminId,
      "…against the super admin who did it",
    );
    assert(
      createAudit[0]?.after_state?.passwordSet === true &&
        createAudit[0]?.after_state?.password === undefined,
      "…and the audit records THAT a password was set, never the password",
    );

    const dupEmail = await rejects(
      () =>
        createTeacher(actor, {
          name: "Someone else",
          email: `${tag}-new@edura.test`,
          password: "Passw0rd!NEW",
        }),
      /already exists/i,
    );
    assert(dupEmail.threw && dupEmail.matched, "a duplicate email is refused by name");

    const dupPhone = await rejects(
      () =>
        createTeacher(actor, {
          name: "Someone else",
          email: `${tag}-other@edura.test`,
          password: "Passw0rd!NEW",
          phone: "01012345678",
        }),
      /already exists/i,
    );
    assert(dupPhone.threw && dupPhone.matched, "…and so is a duplicate phone");
    assert(
      Number((await q(`SELECT count(*)::int n FROM users WHERE name='Someone else'`))[0].n) === 0,
      "…leaving no half-made account behind",
    );

    // ── UPDATE ────────────────────────────────────────────────────────────
    section("updateTeacherProfile");

    const upd = await updateTeacherProfile(
      created.id,
      { name: `${tag} Renamed`, bio: "Teaches physics.", experienceYears: 9 },
      actor,
    );
    assert(
      upd.changed.sort().join(",") === "bio,experienceYears,name",
      "only the fields that actually changed are reported",
    );
    const after = (await q(`SELECT name FROM users WHERE id=$1`, [created.id]))[0];
    const afterP = (await q(`SELECT bio, experience_years FROM teacher_profiles WHERE user_id=$1`, [
      created.id,
    ]))[0];
    assert(after.name === `${tag} Renamed`, "the users row is written");
    assert(
      afterP.bio === "Teaches physics." && afterP.experience_years === 9,
      "…and the teacher_profiles row, in one transaction",
    );

    const updAudit = await auditRows("teacher.profile_updated", created.id);
    assert(updAudit.length === 1, "the edit is audited");
    assert(
      updAudit[0]?.before_state?.experienceYears === 7 &&
        updAudit[0]?.after_state?.experienceYears === 9,
      "…with the real before and after, not just the new value",
    );

    const noop = await updateTeacherProfile(created.id, { name: `${tag} Renamed` }, actor);
    assert(noop.changed.length === 0, "a patch that changes nothing reports changed: []");
    assert(
      (await auditRows("teacher.profile_updated", created.id)).length === 1,
      "…and writes no second audit row",
    );

    const empty = await rejects(
      () => updateTeacherProfile(created.id, {}, actor),
      /Nothing to update/i,
    );
    assert(empty.threw && empty.matched, "an empty patch is refused");

    const illegal = await rejects(
      () =>
        updateTeacherProfile(
          created.id,
          { status: "active" } as never,
          actor,
        ),
      /not editable here/i,
    );
    assert(
      illegal.threw && illegal.matched,
      "the editor REFUSES a field outside the whitelist rather than ignoring it",
    );
    const roleReach = await rejects(
      () => updateTeacherProfile(created.id, { role: "super_admin" } as never, actor),
      /not editable here/i,
    );
    assert(roleReach.threw && roleReach.matched, "…including role");

    const student = await mkUser("student", "student");
    const wrongRole = await rejects(
      () => updateTeacherProfile(student, { name: "x" }, actor),
      /not a teacher/i,
    );
    assert(wrongRole.threw && wrongRole.matched, "a non-teacher cannot be edited through this door");

    const other = await mkUser("clash", "teacher");
    await q(`UPDATE users SET email=$2 WHERE id=$1`, [other, `${tag}-clash@edura.test`]);
    const emailClash = await rejects(
      () => updateTeacherProfile(created.id, { email: `${tag}-clash@edura.test` }, actor),
      /already uses this email/i,
    );
    assert(
      emailClash.threw && emailClash.matched,
      "an email already in use is refused by name, not by a raw unique-index 500",
    );

    // ── STATUS ────────────────────────────────────────────────────────────
    section("setTeacherStatus");

    const beforeVersion = Number(
      (await q(`SELECT token_version FROM users WHERE id=$1`, [created.id]))[0].token_version,
    );

    const off = await setTeacherStatus(created.id, "deactivate", "Left the platform", actor);
    assert(off.status === "suspended", "deactivate moves the account to suspended");
    assert(off.previousStatus === "active", "…and reports where it came from");
    assert(
      (await q(`SELECT status FROM users WHERE id=$1`, [created.id]))[0].status === "suspended",
      "…in the database",
    );

    // The single mechanism is what writes the audit, so the action name here
    // is `user.suspended` — NOT a teacher-specific one. A teacher-shaped audit
    // action appearing would mean a second writer had been introduced.
    const suspendAudit = await auditRows("user.suspended", created.id);
    assert(
      suspendAudit.length === 1,
      "the audit row is the shared `user.suspended`, proving one mechanism",
    );
    assert(
      suspendAudit[0]?.after_state?.reason === "Left the platform",
      "…carrying the reason the operator typed",
    );
    assert(
      (await auditRows("teacher.suspended", created.id)).length === 0,
      "…and no second, teacher-shaped suspension action exists",
    );

    const afterVersion = Number(
      (await q(`SELECT token_version FROM users WHERE id=$1`, [created.id]))[0].token_version,
    );
    assert(
      afterVersion > beforeVersion,
      "token_version is bumped, so live sessions are revoked without a cascade of our own",
    );

    const noReason = await rejects(
      () => setTeacherStatus(created.id, "activate", "   ", actor),
      /reason/i,
    );
    assert(
      noReason.threw && noReason.matched,
      "a blank reason is refused — in the reinstate direction too",
    );

    const again = await rejects(
      () => setTeacherStatus(created.id, "deactivate", "again", actor),
      /already suspended/i,
    );
    assert(again.threw && again.matched, "deactivating a suspended account is refused");

    const on = await setTeacherStatus(created.id, "activate", "Came back", actor);
    assert(on.status === "active", "activate brings it back");
    assert(
      (await auditRows("user.reinstated", created.id)).length === 1,
      "…and is audited as `user.reinstated`",
    );

    const notTeacher = await rejects(
      () => setTeacherStatus(student, "deactivate", "nope", actor),
      /not a teacher/i,
    );
    assert(
      notTeacher.threw && notTeacher.matched,
      "the teacher door refuses a student, so it cannot be used as a generic user toggle",
    );

    const selfActor = { id: created.id, role: "super_admin" } as SessionUser;
    const self = await rejects(
      () => setTeacherStatus(created.id, "deactivate", "locking myself out", selfActor),
      /your own account/i,
    );
    assert(
      self.threw && self.matched,
      "…and inherits refuse-self from the single mechanism",
    );

    // Deactivation deliberately does NOT cascade. A centre suspends its admin
    // users because they exist only to run it; a teacher's courses, centre
    // affiliations and assistants outlive their account being switched off.
    section("deactivation does not cascade");
    const assistant = await mkUser("assistant", "assistant");
    await q(
      `INSERT INTO teacher_assistants (teacher_id, assistant_id, updated_at)
       VALUES ($1,$2,now())`,
      [created.id, assistant],
    );
    await setTeacherStatus(created.id, "deactivate", "checking the blast radius", actor);
    assert(
      (await q(`SELECT status FROM users WHERE id=$1`, [assistant]))[0].status === "active",
      "the teacher's assistant is untouched",
    );
    assert(
      Number(
        (await q(`SELECT count(*)::int n FROM teacher_assistants WHERE teacher_id=$1 AND removed_at IS NULL`, [
          created.id,
        ]))[0].n,
      ) === 1,
      "…and the delegation link is left standing",
    );
  } finally {
    const u = users;
    await q(`DELETE FROM teacher_assistants WHERE teacher_id = ANY($1::uuid[]) OR assistant_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [u]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite teacher-control.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
