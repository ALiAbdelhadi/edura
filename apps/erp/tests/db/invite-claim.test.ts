import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma, withPlatformContext } from "@repo/database";
import { assertCanReach, canReach, listContacts, ChatError } from "@repo/database/chat-scope";
import { guardianChannelState } from "@repo/database/chat-guardian";
import { POST as credentialsRoute } from "@/app/api/v1/me/credentials/route";
import { registerWalkIn } from "@/lib/services/walk-in/walk-in";
import { createAssistant, resendAssistantInvite } from "@/lib/services/teacher/assistants";
import { createStaff, resendStaffInvite } from "@/lib/services/center/staff";
import {
  setGuardianContact,
  runGuardianContactReminders,
} from "@/lib/services/invites/guardian-contact";
import { resolveCenterActorContext } from "@/lib/authz/center-actor";
import { __setSessionOverrideForTests } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";
import { claimDoor, freshIp, sessionFor, signInDoor } from "./helpers/auth-door";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

process.env.MAIL_PROVIDER = "console";
process.env.INVITE_CHANNELS = "email";
process.env.NEXTAUTH_URL = "http://localhost:3002";

const OWN_PW = "ClaimedByMe!42";

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

type SentMail = { to: string; subject: string; body: string };
const mailbox: SentMail[] = [];
const realLog = console.log;
console.log = (...args: unknown[]) => {
  if (args[0] === "\n[mail]" && typeof args[1] === "object" && args[1]) {
    const m = args[1] as { to?: string; subject?: string; body?: string };
    mailbox.push({ to: m.to ?? "", subject: m.subject ?? "", body: m.body ?? "" });
    return;
  }
  realLog(...args);
};
const mailsTo = (email: string) => mailbox.filter((m) => m.to.toLowerCase() === email.toLowerCase());
function drainMail() {
  mailbox.length = 0;
}

const login = (email: string, password: string) => signInDoor(email, password);
const claim = (token: string) => claimDoor(token);

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get("token") as string;
}

async function setOwnPassword(
  userId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const user = await dbUser(userId);
  __setSessionOverrideForTests(
    () =>
      ({
        id: user!.id,
        role: user!.role,
        email: user!.email,
        name: user!.name,
        locale: user!.locale,
      }) as SessionUser,
  );
  try {
    const res = await credentialsRoute(
      new Request("http://localhost:3002/api/v1/me/credentials", {
        method: "POST",
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

const dbUser = (id: string) =>
  withPlatformContext((tx) => tx.user.findUnique({ where: { id } }));

const liveTokensFor = async (userId: string) =>
  (
    await admin.query(
      `SELECT id, purpose, used_at, expires_at FROM invite_tokens WHERE user_id = $1`,
      [userId],
    )
  ).rows as { id: string; purpose: string; used_at: Date | null; expires_at: Date }[];

async function main() {
  const tag = "inv-" + Math.floor(Math.random() * 1e9).toString(36);
  realLog("Invite / claim / guardian-gate proof —", tag);

  const cleanupUsers: string[] = [];
  const cleanupCenters: string[] = [];

  const phoneBase = 10_000_000 + Math.floor(Math.random() * 89_000_000);
  const phone = (n: number) => `+2010${(phoneBase + n).toString().slice(0, 8)}`;

  const fx = await withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: {
        name: tag + "-center",
        shortId: tag.slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
        isDemo: true,
      },
    });
    cleanupCenters.push(center.id);

    const owner = await tx.user.create({
      data: {
        email: `${tag}-owner@x.io`,
        name: tag + "-owner",
        role: "center_admin",
        status: "active",
        passwordHash: await bcrypt.hash("OwnerPass!1", 10),
      },
    });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    cleanupUsers.push(owner.id);

    const teacher = await tx.user.create({
      data: {
        email: `${tag}-teacher@x.io`,
        name: tag + "-teacher",
        role: "teacher",
        status: "active",
        passwordHash: await bcrypt.hash("TeachPass!1", 10),
      },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, subjects: [] } });
    cleanupUsers.push(teacher.id);

    const course = await tx.course.create({
      data: {
        title: tag + "-course",
        teacherId: teacher.id,
        centerId: center.id,
        subject: "math",
        daysOfWeek: [1],
        startTime: "16:00",
        endTime: "18:00",
        startDate: new Date(),
        price: 0,
        maxStudents: 30,
        isDemo: true,
      },
    });

    return { center: center.id, owner, teacher, course: course.id };
  });

  const ownerU: SessionUser = {
    id: fx.owner.id,
    role: "center_admin",
    centerId: fx.center,
    email: fx.owner.email,
    name: fx.owner.name,
    locale: "ar",
  } as SessionUser;
  const teacherU: SessionUser = {
    id: fx.teacher.id,
    role: "teacher",
    email: fx.teacher.email,
    name: fx.teacher.name,
    locale: "ar",
  } as SessionUser;

  try {
    realLog("\n1. PART A — walk-in student, guardian EMAIL on file");
    drainMail();
    const guardianEmail = `${tag}-guardian@x.io`;
    const wiA = await registerWalkIn(
      {
        fullName: tag + " Student A",
        phone: phone(1),
        guardianEmail,
        locale: "en",
      },
      ownerU,
    );
    cleanupUsers.push(wiA.studentId);

    assert(wiA.invite.recipient === "guardian_email", "invite addressed to the guardian email");
    assert(mailsTo(guardianEmail).length === 1, "exactly one email went to the guardian");
    assert(
      mailsTo(`${tag}-student-a@x.io`).length === 0 && mailbox.length === 1,
      "no mail was addressed to anyone else (the child got nothing)",
    );
    assert(!wiA.invite.guardianEmailRequired, "no guardian email owed when one was supplied");

    const linkA = wiA.invite.claimLink as string;
    assert(!!linkA && linkA.includes("/claim?token="), "a claim link was minted");

    const claimedA = await claim(tokenFromLink(linkA));
    assert(
      claimedA.ok && (claimedA.user.id as string) === wiA.studentId,
      "claim token signs the student in",
    );
    assert(
      (await dbUser(wiA.studentId))!.status === "active",
      "claiming flips the shell account to active",
    );

    const studentLoginEmail = `${tag}-studentlogin@x.io`;
    const credA = await setOwnPassword(wiA.studentId, {
      email: studentLoginEmail,
      password: OWN_PW,
    });
    assert(credA.status === 200, "guardian sets the student's email + password (set-once)");
    const loginA = await login(studentLoginEmail, OWN_PW);
    assert(
      loginA.ok && (loginA.user.id as string) === wiA.studentId,
      "student can now log in with the password the GUARDIAN chose",
    );

    assert(!(await claim(tokenFromLink(linkA))).ok, "the claim token is single-use (replay refused)");
    const credAgain = await setOwnPassword(wiA.studentId, { password: "Another!Pass9" });
    assert(credAgain.status >= 400, "me/credentials is set-once (second call refused)");

    realLog("\n2. PART A — MINOR with PHONE ONLY (the child-safety path)");
    drainMail();
    const wiB = await registerWalkIn(
      {
        fullName: tag + " Student B",
        phone: phone(2),
        guardianPhone: phone(90),
        locale: "en",
      },
      ownerU,
    );
    cleanupUsers.push(wiB.studentId);

    assert(wiB.invite.recipient === "none", "no recipient resolved for a phone-only minor");
    assert(wiB.invite.email.status === "no_recipient", "delivery reports no_recipient, not a failure");
    assert(mailbox.length === 0, "NO email was sent anywhere — the child's own inbox was not used");
    assert(!!wiB.invite.claimLink, "the copyable claim link is still returned for in-person handover");
    assert(wiB.invite.guardianEmailRequired, "the response flags that a guardian email is owed");
    assert(!!wiB.invite.guardianContactDueAt, "an escalation deadline was set");

    const profB = await admin.query(
      `SELECT guardian_phone, guardian_email, guardian_contact_due_at
         FROM student_profiles WHERE user_id = $1`,
      [wiB.studentId],
    );
    assert(
      profB.rows[0].guardian_phone === phone(90) && profB.rows[0].guardian_email === null,
      "the guardian PHONE is stored for the record; no email on file",
    );

    const claimedB = await claim(tokenFromLink(wiB.invite.claimLink as string));
    assert(
      claimedB.ok && (claimedB.user.id as string) === wiB.studentId,
      "the phone-only student still registers and can claim",
    );
    await setOwnPassword(wiB.studentId, {
      email: `${tag}-studentb-login@x.io`,
      password: OWN_PW,
    });
    const loginB = await login(`${tag}-studentb-login@x.io`, OWN_PW);
    assert(
      loginB.ok && (loginB.user.id as string) === wiB.studentId,
      "phone-only student logs in normally — the account is NOT suspended",
    );

    await withPlatformContext((tx) =>
      tx.enrollment.create({
        data: {
          studentId: wiB.studentId,
          courseId: fx.course,
          centerId: fx.center,
          status: "active",
          enrolledBy: wiB.studentId,
        },
      }),
    );

    const stateB = await withPlatformContext((tx) => guardianChannelState(tx, wiB.studentId));
    assert(stateB.isMinor && !stateB.hasGuardianChannel && stateB.locked, "guardian channel LOCKED");

    const actorStudentB = { id: wiB.studentId, role: "student" as const };
    const actorTeacher = { id: fx.teacher.id, role: "teacher" as const };

    let lockErr: unknown = null;
    await withPlatformContext(async (tx) => {
      try {
        await assertCanReach(tx, actorStudentB, fx.teacher.id);
      } catch (e) {
        lockErr = e;
      }
    });
    assert(
      lockErr instanceof ChatError && (lockErr as ChatError).code === "guardian_required",
      "student -> teacher DENIED with guardian_required",
    );
    assert(
      !(await withPlatformContext((tx) => canReach(tx, actorTeacher, wiB.studentId))),
      "teacher -> student DENIED too (the gate is symmetric)",
    );
    assert(
      !(await withPlatformContext((tx) => listContacts(tx, actorStudentB))).some(
        (c) => c.role === "teacher" || c.role === "assistant",
      ),
      "the DIRECTORY hides every adult contact — no drift between gate and search",
    );
    assert(
      !(await withPlatformContext((tx) => listContacts(tx, actorTeacher))).some(
        (c) => c.id === wiB.studentId,
      ),
      "the teacher's directory hides the locked student",
    );

    const parentNoEmail = await withPlatformContext(async (tx) => {
      const p = await tx.user.create({
        data: {
          name: tag + "-parent-noemail",
          role: "parent",
          status: "active",
          phone: phone(80),
          passwordHash: await bcrypt.hash("ParentPass!1", 10),
        },
      });
      await tx.parentProfile.create({ data: { userId: p.id } });
      await tx.parentStudentLink.create({
        data: {
          parentId: p.id,
          studentId: wiB.studentId,
          status: "approved",
          initiatedBy: "parent",
        },
      });
      return p;
    });
    cleanupUsers.push(parentNoEmail.id);

    assert(
      (await withPlatformContext((tx) => guardianChannelState(tx, wiB.studentId))).locked,
      "an approved parent WITHOUT an email does NOT satisfy the guardian channel",
    );
    const actorParent = { id: parentNoEmail.id, role: "parent" as const };
    assert(
      await withPlatformContext((tx) => canReach(tx, actorParent, fx.teacher.id)),
      "the PARENT can still reach the teacher while the child's channel is locked",
    );
    assert(
      !(await withPlatformContext((tx) => canReach(tx, actorStudentB, fx.teacher.id))),
      "…while the child's adult channel stays shut",
    );
    let whyDenied: string | null = null;
    await withPlatformContext(async (tx) => {
      try {
        await assertCanReach(tx, actorStudentB, fx.teacher.id);
      } catch (e) {
        whyDenied = e instanceof ChatError ? e.code : null;
      }
    });
    assert(
      whyDenied === "guardian_required",
      "the denial names the guardian gate, not a missing relationship",
    );

    await admin.query(`UPDATE users SET email=$2 WHERE id=$1`, [
      parentNoEmail.id,
      `${tag}-parentb@x.io`,
    ]);
    assert(
      (await withPlatformContext((tx) => guardianChannelState(tx, wiB.studentId))).hasGuardianChannel,
      "an APPROVED parent link WITH an email satisfies the guardian channel (rule a)",
    );
    await admin.query(`UPDATE parent_student_links SET status='pending' WHERE student_id=$1`, [
      wiB.studentId,
    ]);
    assert(
      (await withPlatformContext((tx) => guardianChannelState(tx, wiB.studentId))).locked,
      "a PENDING (unapproved) parent link does NOT satisfy the gate",
    );
    await admin.query(`UPDATE parent_student_links SET status='approved' WHERE student_id=$1`, [
      wiB.studentId,
    ]);
    await admin.query(`UPDATE users SET email=NULL WHERE id=$1`, [parentNoEmail.id]);
    assert(
      (await withPlatformContext((tx) => guardianChannelState(tx, wiB.studentId))).locked,
      "…and an approved link whose parent has no email leaves it locked again",
    );

    const stB = await setGuardianContact(ownerU, wiB.studentId, {
      guardianEmail: `${tag}-guardianb@x.io`,
    });
    assert(!stB.messagingLocked, "adding the guardian email UNLOCKS adult messaging");
    assert(
      await withPlatformContext((tx) => canReach(tx, actorStudentB, fx.teacher.id)),
      "student -> teacher now ALLOWED",
    );
    assert(
      (await withPlatformContext((tx) => listContacts(tx, actorTeacher))).some(
        (c) => c.id === wiB.studentId,
      ),
      "the directory shows the student again — gate and search moved together",
    );
    const auditB = await admin.query(
      `SELECT count(*)::int c FROM audit_logs WHERE action='student.guardian_email_set' AND actor_id=$1`,
      [ownerU.id],
    );
    assert(auditB.rows[0].c >= 1, "setting a guardian email writes an audit row");

    let selfErr: unknown = null;
    try {
      await setGuardianContact(ownerU, wiA.studentId, { guardianEmail: studentLoginEmail });
    } catch (e) {
      selfErr = e;
    }
    assert(!!selfErr, "the guardian email may not equal the student's own login email");

    realLog("\n3. PART A — deadline ESCALATES, never suspends or unlocks");
    const wiC = await registerWalkIn(
      { fullName: tag + " Student C", phone: phone(3), locale: "en" },
      ownerU,
    );
    cleanupUsers.push(wiC.studentId);
    await admin.query(
      `UPDATE student_profiles SET guardian_contact_due_at = now() - interval '1 day' WHERE user_id=$1`,
      [wiC.studentId],
    );
    await admin.query(
      `INSERT INTO center_student_rosters (center_id, student_id, added_at, updated_at)
       VALUES ($1,$2,now(),now()) ON CONFLICT DO NOTHING`,
      [fx.center, wiC.studentId],
    );

    const sweep = await runGuardianContactReminders(new Date());
    assert(sweep.reminded >= 1, `the reminder sweep notified the family (${sweep.reminded})`);
    assert(sweep.escalated >= 1, `past the deadline it ALSO notified the center (${sweep.escalated})`);

    const afterSweep = await dbUser(wiC.studentId);
    assert(
      afterSweep!.status !== "suspended" && afterSweep!.deletedAt === null,
      "passing the deadline does NOT suspend the account",
    );
    assert(
      (await withPlatformContext((tx) => guardianChannelState(tx, wiC.studentId))).locked,
      "passing the deadline does NOT unlock adult messaging",
    );
    const centerNotified = await admin.query(
      `SELECT count(*)::int c FROM notifications
        WHERE type='guardian_contact_required' AND user_id=$1`,
      [fx.owner.id],
    );
    assert(centerNotified.rows[0].c >= 1, "the center owner received the escalation notice");

    const sweep2 = await runGuardianContactReminders(new Date());
    assert(sweep2.reminded === 0, "the sweep is idempotent inside its reminder window");

    realLog("\n4. PART A — existing student flow is UNCHANGED");
    drainMail();
    const dup = await registerWalkIn(
      { fullName: tag + " Student A again", phone: phone(1), locale: "en" },
      ownerU,
    );
    assert(dup.existing && dup.studentId === wiA.studentId, "duplicate-by-phone finds the same account, no duplicate");
    assert(!dup.invite.claimLink, "a CREDENTIALED account is never handed a claim link");
    assert(mailbox.length === 0, "and no invite email is sent for it");
    assert("whatsapp" in dup, "the legacy `whatsapp` result key still exists for the counter screen");
    assert(dup.whatsapp.status === "skipped", "the WhatsApp leg is skipped (not failed) while the channel is off");

    const wiD = await registerWalkIn(
      { fullName: tag + " Student D", phone: phone(4), guardianEmail: `${tag}-gd@x.io`, locale: "en" },
      ownerU,
    );
    cleanupUsers.push(wiD.studentId);
    const claimedD = await claim(tokenFromLink(wiD.invite.claimLink as string));
    assert(
      claimedD.ok && (claimedD.user.id as string) === wiD.studentId,
      "a walk-in student token claims through the single invite-token door (Step 7 unbroken)",
    );

    realLog("\n5. PART B — ASSISTANT invite -> claim -> login");
    drainMail();
    const asstEmail = `${tag}-asst@x.io`;
    const asst = await createAssistant(teacherU, { name: tag + " Assistant", email: asstEmail, locale: "en" });
    cleanupUsers.push(asst.user.id);

    const asstRow = await dbUser(asst.user.id);
    assert(asstRow!.passwordHash === null, "the assistant account is created with NO password");
    assert(asstRow!.status === "shell", "…and in shell status");
    assert(
      !(await login(asstEmail, OWN_PW)).ok && !(await login(asstEmail, "anything123")).ok,
      "an unclaimed assistant cannot log in at the password door",
    );
    assert(mailsTo(asstEmail).length === 1, "an invite email was sent to the assistant");
    assert(
      mailsTo(asstEmail)[0]!.body.includes(asst.invite!.claimLink),
      "the emailed link is the same single-use claim link returned to the teacher",
    );
    assert(!!asst.invite?.claimLink, "the teacher also gets the copyable fallback link");

    const claimedAsst = await claim(tokenFromLink(asst.invite!.claimLink));
    assert(
      claimedAsst.ok && (claimedAsst.user.id as string) === asst.user.id,
      "the assistant claims their account",
    );
    const asstCred = await setOwnPassword(asst.user.id, { password: OWN_PW });
    assert(asstCred.status === 200, "the assistant sets THEIR OWN password");
    assert(
      asstCred.body?.data?.email === asstEmail,
      "…at the address they were invited at (email is not re-choosable)",
    );

    const asstLogin = await login(asstEmail, OWN_PW);
    assert(
      asstLogin.ok && (asstLogin.user.id as string) === asst.user.id,
      "the assistant logs in with their own password",
    );
    const asstSession = asstLogin.ok ? await sessionFor(asstLogin.cookie) : null;
    assert(asstSession?.role === "assistant", "…as role=assistant");
    const binding = await admin.query(
      `SELECT teacher_id FROM teacher_assistants WHERE assistant_id=$1 AND removed_at IS NULL`,
      [asst.user.id],
    );
    assert(
      binding.rows.length === 1 && binding.rows[0].teacher_id === fx.teacher.id,
      "the assistant is bound to EXACTLY ONE teacher (on-behalf-of binding intact)",
    );
    const asstAudit = await admin.query(
      `SELECT count(*)::int c FROM audit_logs WHERE action='assistant.invited' AND target_id=$1`,
      [asst.user.id],
    );
    assert(asstAudit.rows[0].c === 1, "the invite is audited");

    let resendErr: unknown = null;
    try {
      await resendAssistantInvite(teacherU, asst.link.id, "en");
    } catch (e) {
      resendErr = e;
    }
    assert(!!resendErr, "re-inviting an already-claimed assistant is refused");

    realLog("\n6. PART B — CENTER STAFF, each sub-role");
    const staffRoles = ["receptionist", "manager", "center_accountant"] as const;
    for (const role of staffRoles) {
      drainMail();
      const email = `${tag}-${role}@x.io`;
      const created = await createStaff(ownerU, {
        name: `${tag} ${role}`,
        email,
        role,
        locale: "en",
      });
      cleanupUsers.push(created.user.id);

      const row = await dbUser(created.user.id);
      assert(
        row!.passwordHash === null && row!.status === "shell",
        `[${role}] created with NO password, in shell status (the no-password bug fixed at the source)`,
      );
      assert(
        !(await login(email, OWN_PW)).ok,
        `[${role}] cannot log in before claiming`,
      );
      assert(mailsTo(email).length === 1, `[${role}] invite email sent`);
      assert(!!created.invite?.claimLink, `[${role}] copyable fallback link returned to the owner`);

      const claimed = await claim(tokenFromLink(created.invite!.claimLink));
      assert(
        claimed.ok && (claimed.user.id as string) === created.user.id,
        `[${role}] claims their account`,
      );
      const claimSession = claimed.ok ? await sessionFor(claimed.cookie) : null;
      assert(
        claimSession?.centerId === fx.center,
        `[${role}] the claimed session carries the center (C-04 resolver)`,
      );

      const cred = await setOwnPassword(created.user.id, { password: OWN_PW });
      assert(cred.status === 200, `[${role}] sets their own password`);

      const loggedIn = await login(email, OWN_PW);
      assert(
        loggedIn.ok && (loggedIn.user.id as string) === created.user.id,
        `[${role}] logs in via the C-04 password door`,
      );
      const loginSession = loggedIn.ok ? await sessionFor(loggedIn.cookie) : null;
      assert(loginSession?.role === "center_staff", `[${role}] as role=center_staff`);
      assert(loginSession?.centerId === fx.center, `[${role}] bound to exactly this center`);

      const ctx = await resolveCenterActorContext({
        id: created.user.id,
        role: "center_staff",
      } as SessionUser);
      assert(
        ctx.centerId === fx.center && ctx.staffRole === role,
        `[${role}] resolves to the correct center + sub-role scope`,
      );
    }

    realLog("\n7. SECURITY — the gates the purpose map buys us");
    const crossEmail = `${tag}-cross@x.io`;
    const cross = await createStaff(ownerU, {
      name: tag + " Cross",
      email: crossEmail,
      role: "receptionist",
      locale: "en",
    });
    cleanupUsers.push(cross.user.id);
    const crossToken = tokenFromLink(cross.invite!.claimLink);
    await admin.query(`UPDATE invite_tokens SET purpose='assistant_invite' WHERE token_hash=$1`, [
      createHash("sha256").update(crossToken).digest("hex"),
    ]);
    assert(
      !(await claim(crossToken)).ok,
      "a token whose purpose does not match the account's role is refused (purpose owns the role)",
    );
    await admin.query(`UPDATE invite_tokens SET purpose='center_staff_invite' WHERE token_hash=$1`, [
      createHash("sha256").update(crossToken).digest("hex"),
    ]);

    await admin.query(`UPDATE center_staff SET removed_at=now() WHERE staff_user_id=$1`, [
      cross.user.id,
    ]);
    assert(
      !(await claim(crossToken)).ok,
      "revoking the staff link kills the outstanding invite (no token hunt needed)",
    );
    await admin.query(`UPDATE center_staff SET removed_at=NULL WHERE staff_user_id=$1`, [
      cross.user.id,
    ]);

    await admin.query(
      `UPDATE invite_tokens SET expires_at = now() - interval '1 hour' WHERE token_hash=$1`,
      [createHash("sha256").update(crossToken).digest("hex")],
    );
    assert(!(await claim(crossToken)).ok, "an EXPIRED token is refused");

    const takeover = await resendStaffInvite(ownerU, cross.link.id, "en");
    const takeoverToken = tokenFromLink(takeover.claimLink);
    await admin.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [
      cross.user.id,
      await bcrypt.hash("SomeoneElse!9", 10),
    ]);
    assert(
      !(await claim(takeoverToken)).ok,
      "a token pointing at an account that HAS a password is refused (no takeover)",
    );

    await admin.query(`UPDATE users SET password_hash=NULL WHERE id=$1`, [cross.user.id]);
    const first = await resendStaffInvite(ownerU, cross.link.id, "en");
    const second = await resendStaffInvite(ownerU, cross.link.id, "en");
    assert(
      !(await claim(tokenFromLink(first.claimLink))).ok,
      "issuing a new invite invalidates the previous link",
    );
    const newest = await claim(tokenFromLink(second.claimLink));
    assert(
      newest.ok && (newest.user.id as string) === cross.user.id,
      "…and the newest link works",
    );

    const leaked = await admin.query(
      `SELECT count(*)::int c FROM invite_tokens WHERE token_hash = $1`,
      [tokenFromLink(second.claimLink)],
    );
    assert(leaked.rows[0].c === 0, "the raw token is never stored — only its SHA-256 hash");
    const auditLeak = await admin.query(
      `SELECT count(*)::int c FROM audit_logs
        WHERE action IN ('assistant.invited','center_staff.invited')
          AND after_state::text LIKE '%token=%'`,
    );
    assert(auditLeak.rows[0].c === 0, "no audit row contains a claim token");
    const waLeak = await admin.query(
      `SELECT count(*)::int c FROM whatsapp_messages WHERE params::text ~ 'token=[A-Za-z0-9]'`,
    );
    assert(waLeak.rows[0].c === 0, "no WhatsApp log row contains an unredacted token");

    let limited = false;
    for (let i = 0; i < 12; i++) {
      const r = await claimDoor("f".repeat(64), { ip: "203.0.113.254" });
      if (!r.ok && r.message === "RATE_LIMITED") limited = true;
    }
    assert(limited, "the claim door is rate-limited per IP");

    realLog("\n8. INVARIANT — no account can be stranded");
    const stranded = await admin.query(
      `SELECT u.id, u.role
         FROM users u
        WHERE u.role IN ('assistant','center_staff')
          AND u.password_hash IS NULL
          AND u.deleted_at IS NULL
          AND u.name LIKE $1
          AND u.id <> $2
          AND NOT EXISTS (
                SELECT 1 FROM invite_tokens t
                 WHERE t.user_id = u.id AND t.used_at IS NULL AND t.expires_at > now()
              )`,
      [`${tag}%`, cross.user.id],
    );
    assert(
      stranded.rows.length === 0,
      `every assistant/staff account has either a password or a LIVE invite (${stranded.rows.length} stranded)`,
    );
  } finally {
    console.log = realLog;
    await admin.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM invite_tokens WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM whatsapp_messages WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM enrollments WHERE student_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM center_student_rosters WHERE student_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM parent_student_links WHERE student_id = ANY($1::uuid[]) OR parent_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM teacher_assistants WHERE assistant_id = ANY($1::uuid[]) OR teacher_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM center_staff WHERE staff_user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM courses WHERE center_id = ANY($1::uuid[])`, [cleanupCenters]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM parent_profiles WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE user_id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [cleanupUsers]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [cleanupCenters]);
    await admin.end();
    await prisma.$disconnect();
  }

  realLog(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite invite-claim.test.ts" })
  .then(() => main()).catch((e) => {
  console.log = realLog;
  console.error(e);
  process.exit(1);
});
